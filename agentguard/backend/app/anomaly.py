import time
import re
import logging
from collections import deque
from typing import Dict, Set, Optional, Tuple, Any
import aiosqlite
from .models import DB_PATH
from .audit import append_audit_entry

logger = logging.getLogger("agentguard.anomaly")

class AnomalyMonitor:
    def __init__(self):
        # Sliding windows per agent: agent_id -> deque of timestamps
        self.action_timestamps: Dict[str, deque] = {}
        self.destructive_timestamps: Dict[str, deque] = {}
        self.block_timestamps: Dict[str, deque] = {}
        self.agent_known_tools: Dict[str, Set[str]] = {}
        self.notifier_callback = None # Set by main.py / WebSocket broadcaster

    def set_notifier(self, callback):
        self.notifier_callback = callback

    async def notify(self, event_type: str, data: Any):
        if self.notifier_callback:
            try:
                await self.notifier_callback(event_type, data)
            except Exception as e:
                logger.warning(f"Error publishing anomaly notification: {e}")

    def _is_destructive(self, tool: str, args: Dict[str, Any]) -> bool:
        if tool == "db.query":
            sql = str(args.get("sql", "")).lower()
            return bool(re.search(r'\b(drop|truncate|delete\s+from|alter|update)\b', sql))
        if tool == "crm.export":
            return args.get("limit", 0) > 20
        return False

    async def check_rate_and_pre_execution(self, agent_id: str, tool: str, args: Dict[str, Any], max_per_min: int = 30) -> Tuple[bool, Optional[str]]:
        """
        Runs BEFORE policy evaluation.
        Checks if rate limit exceeded. If so, triggers auto-pause and returns (False, error_msg).
        """
        now = time.time()
        if agent_id not in self.action_timestamps:
            self.action_timestamps[agent_id] = deque()

        q = self.action_timestamps[agent_id]
        # Evict older than 60s
        while q and now - q[0] > 60:
            q.popleft()

        q.append(now)

        if len(q) > max_per_min:
            msg = f"Agent '{agent_id}' exceeded rate limit: {len(q)} actions in 60s (max {max_per_min}). Agent auto-paused."
            await self._trigger_auto_pause(agent_id, reason=msg, alert_type="anomaly", severity="critical")
            return False, msg

        # Check new-tool alert
        if agent_id not in self.agent_known_tools:
            self.agent_known_tools[agent_id] = set()
        if tool not in self.agent_known_tools[agent_id]:
            self.agent_known_tools[agent_id].add(tool)
            # Create low severity alert if this isn't the very first tool call
            if len(self.agent_known_tools[agent_id]) > 1:
                await self._create_alert(
                    agent_id=agent_id,
                    severity="low",
                    alert_type="new_tool",
                    message=f"Agent '{agent_id}' invoked tool '{tool}' for the first time."
                )

        return True, None

    async def record_action_outcome(self, agent_id: str, tool: str, args: Dict[str, Any], decision: str, action_id: str):
        """Runs AFTER policy/gateway decision to evaluate destructive burst or repeated blocks."""
        now = time.time()

        # 1. Destructive burst check (5 in 60s)
        if self._is_destructive(tool, args):
            if agent_id not in self.destructive_timestamps:
                self.destructive_timestamps[agent_id] = deque()
            dq = self.destructive_timestamps[agent_id]
            while dq and now - dq[0] > 60:
                dq.popleft()
            dq.append(now)

            if len(dq) >= 5:
                msg = f"Destructive action burst detected for agent '{agent_id}': {len(dq)} destructive actions in 60s! Auto-pausing agent."
                await self._trigger_auto_pause(agent_id, reason=msg, alert_type="anomaly", severity="critical", action_id=action_id)

        # 2. Repeated BLOCK check (5 in 120s)
        if decision == "BLOCK":
            if agent_id not in self.block_timestamps:
                self.block_timestamps[agent_id] = deque()
            bq = self.block_timestamps[agent_id]
            while bq and now - bq[0] > 120:
                bq.popleft()
            bq.append(now)

            if len(bq) >= 5:
                msg = f"Repeated BLOCK burst detected for agent '{agent_id}': {len(bq)} blocked actions in 120s! Compromise suspect. Auto-pausing agent."
                await self._trigger_auto_pause(agent_id, reason=msg, alert_type="anomaly", severity="critical", action_id=action_id)

    async def _trigger_auto_pause(self, agent_id: str, reason: str, alert_type: str = "anomaly", severity: str = "critical", action_id: str = None):
        logger.warning(f"Triggering AUTO-PAUSE for {agent_id}: {reason}")
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("UPDATE agents SET status = 'PAUSED' WHERE id = ? AND status != 'KILLED'", (agent_id,))
            await db.commit()

        # Create alert
        alert_id = await self._create_alert(agent_id=agent_id, severity=severity, alert_type=alert_type, message=reason, action_id=action_id)

        # Append audit entry
        await append_audit_entry(
            event_type="AGENT_PAUSED",
            agent_id=agent_id,
            action_id=action_id,
            actor="system",
            payload={"reason": reason, "alert_id": alert_id}
        )

        # Publish WS event
        await self.notify("agent", {"agent_id": agent_id, "status": "PAUSED", "reason": reason})

    async def _create_alert(self, agent_id: str, severity: str, alert_type: str, message: str, action_id: str = None) -> str:
        import uuid
        alert_id = f"alt_{uuid.uuid4().hex[:10]}"
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("""
                INSERT INTO alerts (id, agent_id, severity, type, message, action_id, acknowledged)
                VALUES (?, ?, ?, ?, ?, ?, 0)
            """, (alert_id, agent_id, severity, alert_type, message, action_id))
            await db.commit()

        await self.notify("alert", {
            "id": alert_id,
            "agent_id": agent_id,
            "severity": severity,
            "type": alert_type,
            "message": message,
            "action_id": action_id
        })
        return alert_id

anomaly_monitor = AnomalyMonitor()
