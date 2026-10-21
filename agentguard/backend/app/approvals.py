import json
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import aiosqlite
from .models import DB_PATH
from .adapters import TOOLS
from .audit import append_audit_entry

logger = logging.getLogger("agentguard.approvals")

class ApprovalService:
    def __init__(self):
        self.notifier_callback = None

    def set_notifier(self, callback):
        self.notifier_callback = callback

    async def notify(self, event_type: str, data: Any):
        if self.notifier_callback:
            try:
                await self.notifier_callback(event_type, data)
            except Exception as e:
                logger.warning(f"Error notifying approval event: {e}")

    async def create_pending_approval(self, action_id: str) -> str:
        import uuid
        approval_id = f"appr_{uuid.uuid4().hex[:10]}"
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("""
                INSERT INTO approvals (id, action_id, status, created_at)
                VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
            """, (approval_id, action_id))
            await db.commit()

        await self.notify("approval", {
            "id": approval_id,
            "action_id": action_id,
            "status": "pending"
        })
        return approval_id

    async def approve(self, approval_id: str, reviewer: str = "security_lead", note: str = "Approved by human operator") -> Dict[str, Any]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,))
            approval = await cursor.fetchone()
            if not approval:
                return {"error": "Approval not found", "success": False}
            if approval["status"] != "pending":
                return {"error": f"Approval is already in state '{approval['status']}'", "success": False}

            action_id = approval["action_id"]
            cursor = await db.execute("SELECT * FROM actions WHERE id = ?", (action_id,))
            action = await cursor.fetchone()
            if not action:
                return {"error": "Action not found", "success": False}

            # Check agent status
            agent_id = action["agent_id"]
            cursor = await db.execute("SELECT status FROM agents WHERE id = ?", (agent_id,))
            agent = await cursor.fetchone()
            if agent and agent["status"] == "KILLED":
                return {"error": "Cannot execute approval: agent is KILLED.", "success": False}

            # Execute tool adapter
            tool_name = action["tool"]
            args = json.loads(action["args_json"]) if action["args_json"] else {}
            adapter = TOOLS.get(tool_name)
            
            if not adapter:
                return {"error": f"Adapter for tool '{tool_name}' not found.", "success": False}

            try:
                result = await adapter(**args)
                result_str = json.dumps(result)
                action_status = "executed"
            except Exception as e:
                logger.error(f"Error executing approved action {action_id}: {e}")
                result = {"error": str(e)}
                result_str = json.dumps(result)
                action_status = "failed"

            # Update approval
            await db.execute("""
                UPDATE approvals
                SET status = 'approved', reviewer = ?, note = ?, resolved_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (reviewer, note, approval_id))

            # Update action
            await db.execute("""
                UPDATE actions
                SET status = ?, result_json = ?, decided_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (action_status, result_str, action_id))

            await db.commit()

        # Audit events with actor=human
        await append_audit_entry(
            event_type="APPROVED",
            agent_id=agent_id,
            action_id=action_id,
            actor=f"human:{reviewer}",
            payload={"approval_id": approval_id, "reviewer": reviewer, "note": note}
        )

        await append_audit_entry(
            event_type="EXECUTED",
            agent_id=agent_id,
            action_id=action_id,
            actor=f"human:{reviewer}",
            payload={"tool": tool_name, "result": result}
        )

        event_data = {
            "approval_id": approval_id,
            "action_id": action_id,
            "status": "approved",
            "action_status": action_status,
            "reviewer": reviewer,
            "result": result
        }
        await self.notify("approval", event_data)
        await self.notify("action", {"id": action_id, "status": action_status, "result": result})

        return {"success": True, "approval_id": approval_id, "action_id": action_id, "result": result}

    async def deny(self, approval_id: str, reviewer: str = "security_lead", note: str = "Denied by human operator") -> Dict[str, Any]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,))
            approval = await cursor.fetchone()
            if not approval:
                return {"error": "Approval not found", "success": False}
            if approval["status"] != "pending":
                return {"error": f"Approval is already in state '{approval['status']}'", "success": False}

            action_id = approval["action_id"]
            cursor = await db.execute("SELECT agent_id FROM actions WHERE id = ?", (action_id,))
            action = await cursor.fetchone()
            agent_id = action["agent_id"] if action else None

            # Update approval
            await db.execute("""
                UPDATE approvals
                SET status = 'denied', reviewer = ?, note = ?, resolved_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (reviewer, note, approval_id))

            # Update action
            await db.execute("""
                UPDATE actions
                SET status = 'denied', decided_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (action_id,))

            await db.commit()

        await append_audit_entry(
            event_type="DENIED",
            agent_id=agent_id,
            action_id=action_id,
            actor=f"human:{reviewer}",
            payload={"approval_id": approval_id, "reviewer": reviewer, "note": note}
        )

        event_data = {
            "approval_id": approval_id,
            "action_id": action_id,
            "status": "denied",
            "reviewer": reviewer,
            "note": note
        }
        await self.notify("approval", event_data)
        await self.notify("action", {"id": action_id, "status": "denied"})

        return {"success": True, "approval_id": approval_id, "status": "denied"}

    async def start_expiry_worker(self):
        """Asyncio background task checking for expired approvals (> 10 min)."""
        while True:
            try:
                await asyncio.sleep(30)
                cutoff = (datetime.utcnow() - timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")
                async with aiosqlite.connect(DB_PATH) as db:
                    db.row_factory = aiosqlite.Row
                    cursor = await db.execute(
                        "SELECT id, action_id FROM approvals WHERE status = 'pending' AND created_at < ?",
                        (cutoff,)
                    )
                    expired = await cursor.fetchall()
                    for exp in expired:
                        await db.execute("UPDATE approvals SET status = 'expired', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", (exp["id"],))
                        await db.execute("UPDATE actions SET status = 'expired' WHERE id = ?", (exp["action_id"],))
                        logger.info(f"Auto-expired pending approval {exp['id']}")
                        await append_audit_entry(
                            event_type="EXPIRED",
                            agent_id=None,
                            action_id=exp["action_id"],
                            actor="system",
                            payload={"approval_id": exp["id"], "reason": "Timeout exceeded 10m"}
                        )
                    await db.commit()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in approval expiry worker: {e}")

approval_service = ApprovalService()
