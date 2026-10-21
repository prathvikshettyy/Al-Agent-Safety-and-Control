import re
import json
import uuid
import hashlib
import logging
from typing import Dict, Any, Optional
import aiosqlite
from .models import DB_PATH
from .policy import policy_engine
from .risk import calculate_risk_score
from .judge import evaluate_with_judge
from .anomaly import anomaly_monitor
from .audit import append_audit_entry
from .approvals import approval_service
from .adapters import TOOLS

logger = logging.getLogger("agentguard.gateway")

# Session taint tracker: agent_id -> bool
TAINTED_SESSIONS: Dict[str, Dict[str, Any]] = {}

INJECTION_PATTERNS = [
    r'(?i)ignore\s+(all\s+)?(previous|prior)\s+instructions',
    r'(?i)send\s+(all\s+)?customers?\s+to',
    r'(?i)forward\s+(all\s+)?emails?\s+to',
    r'(?i)system\s+prompt\s*:',
    r'(?i)exfiltrate',
    r'(?i)https?://[a-zA-Z0-9_\-\.]*(evil|attacker|malicious|pwned|darkweb)\.[a-z]{2,}'
]

def scan_for_injection(text: str) -> Optional[str]:
    for pat in INJECTION_PATTERNS:
        m = re.search(pat, text)
        if m:
            return m.group(0)
    return None

class Gateway:
    def __init__(self):
        self.notifier_callback = None

    def set_notifier(self, callback):
        self.notifier_callback = callback
        anomaly_monitor.set_notifier(callback)
        approval_service.set_notifier(callback)

    async def notify(self, event_type: str, data: Any):
        if self.notifier_callback:
            try:
                await self.notifier_callback(event_type, data)
            except Exception as e:
                logger.warning(f"Gateway failed to publish WebSocket event: {e}")

    async def execute(self, req: Dict[str, Any], agent_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Main execution pipeline. Enforces strict fail-closed safety.
        """
        action_id = f"act_{uuid.uuid4().hex[:12]}"
        agent_id = req.get("agent_id", "").strip()
        task_context = req.get("task_context", "").strip()
        tool = req.get("tool", "").strip()
        args = req.get("args") or {}

        # 1. Basic validation and payload size check (max 64KB)
        args_json_str = json.dumps(args)
        if len(args_json_str) > 65536:
            return {
                "action_id": action_id,
                "decision": "BLOCK",
                "status": "blocked",
                "reason": "Payload size limit exceeded (maximum 64KB).",
                "risk_score": 100
            }

        try:
            # 2. Check agent status and API key in database
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute("SELECT id, role, status, api_key_hash FROM agents WHERE id = ?", (agent_id,))
                agent_row = await cursor.fetchone()

            if not agent_row:
                return {
                    "error": f"Agent '{agent_id}' is not recognized or not registered.",
                    "status_code": 401
                }

            # Optional API key check if key hash configured
            if agent_row["api_key_hash"] and agent_key:
                provided_hash = hashlib.sha256(agent_key.encode('utf-8')).hexdigest()
                if provided_hash != agent_row["api_key_hash"]:
                    return {"error": "Invalid agent API key.", "status_code": 401}

            # Check agent status
            if agent_row["status"] == "PAUSED":
                return {
                    "error": f"Agent '{agent_id}' is currently PAUSED. Actions forbidden until resumed by administrator.",
                    "status_code": 403
                }
            if agent_row["status"] == "KILLED":
                return {
                    "error": f"Agent '{agent_id}' is KILLED. API key permanently revoked.",
                    "status_code": 403
                }

            # Audit: ACTION_RECEIVED
            await append_audit_entry(
                event_type="ACTION_RECEIVED",
                agent_id=agent_id,
                action_id=action_id,
                actor=f"agent:{agent_id}",
                payload={"tool": tool, "args": args, "task_context": task_context}
            )

            # 3. Anomaly pre-execution & Rate limit check
            policy_cfg = policy_engine.agents.get(agent_id)
            max_actions = policy_cfg.limits.get("max_actions_per_minute", 30) if policy_cfg else 30
            allowed_rate, rate_msg = await anomaly_monitor.check_rate_and_pre_execution(agent_id, tool, args, max_per_min=max_actions)
            if not allowed_rate:
                return {
                    "error": rate_msg,
                    "status_code": 429
                }

            # 4. Check session taint
            is_tainted = agent_id in TAINTED_SESSIONS
            injection_in_args = scan_for_injection(str(args) + " " + task_context)
            if injection_in_args:
                is_tainted = True
                TAINTED_SESSIONS[agent_id] = {
                    "reason": f"Prompt injection string: '{injection_in_args}'",
                    "source_action": action_id
                }
                # Create alert
                await anomaly_monitor._create_alert(
                    agent_id=agent_id,
                    severity="high",
                    alert_type="injection",
                    message=f"Prompt injection pattern detected in action parameters: '{injection_in_args}'",
                    action_id=action_id
                )

            # 5. Deterministic Policy Evaluation
            policy_res = policy_engine.evaluate(agent_id, tool, args)

            # 6. Heuristic Risk Scoring
            is_first_tool = tool not in anomaly_monitor.agent_known_tools.get(agent_id, set())
            risk_score, risk_reasons = calculate_risk_score(
                tool=tool,
                args=args,
                is_first_tool_use=is_first_tool,
                is_tainted=is_tainted
            )

            # 7. LLM Judge Evaluation (only if not already BLOCK and score in grey zone 30-70)
            judge_res = None
            if policy_res.decision != "BLOCK" and 30 <= risk_score <= 70:
                judge_res = await evaluate_with_judge(
                    agent_id=agent_id,
                    role=agent_row["role"] or "support",
                    task_context=task_context,
                    tool=tool,
                    args=args
                )
                if judge_res and not judge_res.get("aligned", True):
                    risk_score = min(100, risk_score + 25)
                    risk_reasons.append(f"LLM Judge flagged misalignment: {judge_res.get('reason')}")

            # 8. Decision Combiner
            final_decision = "ALLOW"
            rule_ids = list(policy_res.rule_ids)
            all_reasons = list(policy_res.reasons) + risk_reasons

            if policy_res.decision == "BLOCK":
                final_decision = "BLOCK"
            elif policy_res.decision == "ESCALATE":
                final_decision = "ESCALATE"
            elif judge_res and not judge_res.get("aligned", True) and judge_res.get("confidence", 0) > 0.7:
                final_decision = "ESCALATE"
            elif risk_score >= 70:
                final_decision = "ESCALATE"
            else:
                final_decision = "ALLOW"

            # 9. Handle execution outcomes
            result_data = None
            action_status = "pending" if final_decision == "ESCALATE" else ("blocked" if final_decision == "BLOCK" else "executed")

            if final_decision == "ALLOW":
                adapter = TOOLS.get(tool)
                if not adapter:
                    final_decision = "BLOCK"
                    action_status = "blocked"
                    all_reasons.append(f"Tool '{tool}' adapter not implemented in gateway.")
                else:
                    try:
                        result_data = await adapter(**args)
                        # Check tool output for prompt injection taint (e.g. read documents or customer notes)
                        output_str = str(result_data)
                        detected_taint = scan_for_injection(output_str)
                        if detected_taint:
                            TAINTED_SESSIONS[agent_id] = {
                                "reason": f"Tool output poisoned: '{detected_taint}'",
                                "source_action": action_id
                            }
                            await anomaly_monitor._create_alert(
                                agent_id=agent_id,
                                severity="critical",
                                alert_type="injection",
                                message=f"Tool output contains prompt injection payload: '{detected_taint}'! Session marked tainted.",
                                action_id=action_id
                            )
                    except Exception as adapter_err:
                        logger.error(f"Error running adapter for {tool}: {adapter_err}")
                        final_decision = "BLOCK"
                        action_status = "failed"
                        all_reasons.append(f"Adapter execution error: {str(adapter_err)}")

            # 10. Persist action in database
            judge_json_str = json.dumps(judge_res) if judge_res else None
            result_json_str = json.dumps(result_data) if result_data else None

            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute("""
                    INSERT INTO actions (
                        id, agent_id, task_context, tool, args_json, decision, status,
                        risk_score, rule_ids, judge_json, result_json, decided_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (
                    action_id, agent_id, task_context, tool, args_json_str,
                    final_decision, action_status, risk_score, json.dumps(rule_ids),
                    judge_json_str, result_json_str
                ))
                await db.commit()

            # Record post-decision anomaly outcomes (bursts, repeated blocks)
            await anomaly_monitor.record_action_outcome(agent_id, tool, args, final_decision, action_id)

            # Audit decision and execution
            await append_audit_entry(
                event_type="DECISION",
                agent_id=agent_id,
                action_id=action_id,
                actor="gateway:policy",
                payload={
                    "decision": final_decision,
                    "rule_ids": rule_ids,
                    "risk_score": risk_score,
                    "reasons": all_reasons
                }
            )

            if final_decision == "ALLOW" and action_status == "executed":
                await append_audit_entry(
                    event_type="EXECUTED",
                    agent_id=agent_id,
                    action_id=action_id,
                    actor="gateway:adapter",
                    payload={"tool": tool, "result": result_data}
                )
            elif final_decision == "BLOCK":
                await append_audit_entry(
                    event_type="BLOCKED",
                    agent_id=agent_id,
                    action_id=action_id,
                    actor="gateway:policy",
                    payload={"tool": tool, "reasons": all_reasons}
                )
            elif final_decision == "ESCALATE":
                # Create pending approval
                approval_id = await approval_service.create_pending_approval(action_id)
                await append_audit_entry(
                    event_type="ESCALATED",
                    agent_id=agent_id,
                    action_id=action_id,
                    actor="gateway:policy",
                    payload={"tool": tool, "approval_id": approval_id, "reasons": all_reasons}
                )

            # Broadcast action to live feed
            action_event_payload = {
                "id": action_id,
                "agent_id": agent_id,
                "task_context": task_context,
                "tool": tool,
                "args": args,
                "decision": final_decision,
                "status": action_status,
                "risk_score": risk_score,
                "rule_ids": rule_ids,
                "reasons": all_reasons,
                "result": result_data,
                "judge": judge_res,
                "created_at": "just now"
            }
            await self.notify("action", action_event_payload)

            # Return response
            response = {
                "action_id": action_id,
                "decision": final_decision,
                "status": action_status,
                "reason": "; ".join(all_reasons) if all_reasons else "Action allowed",
                "risk_score": risk_score
            }
            if result_data is not None:
                response["result"] = result_data

            return response

        except Exception as e:
            # FAIL CLOSED: Any unexpected gateway error results in immediate BLOCK
            logger.exception(f"Unhandled exception in gateway pipeline: {e}")
            await append_audit_entry(
                event_type="BLOCKED",
                agent_id=agent_id,
                action_id=action_id,
                actor="gateway:fail_closed",
                payload={"error": str(e)}
            )
            return {
                "action_id": action_id,
                "decision": "BLOCK",
                "status": "failed",
                "reason": f"System error in gateway pipeline (fail-closed): {str(e)}",
                "risk_score": 100
            }

gateway = Gateway()
