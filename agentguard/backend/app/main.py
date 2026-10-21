import os
import json
import asyncio
import logging
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import aiosqlite

from .models import init_db, DB_PATH
from .gateway import gateway
from .audit import verify_chain, append_audit_entry
from .approvals import approval_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("agentguard.main")

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "admin-secret-token-123")

# WebSocket Broadcaster Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: Any):
        if not self.active_connections:
            return
        payload = json.dumps({"type": event_type, "data": data})
        stale = []
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception:
                stale.append(connection)
        for s in stale:
            self.disconnect(s)

manager = ConnectionManager()

# Hook broadcaster into gateway and approvals
async def ws_notify(event_type: str, data: Any):
    await manager.broadcast(event_type, data)

gateway.set_notifier(ws_notify)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting AgentGuard Gateway...")
    await init_db()
    expiry_task = asyncio.create_task(approval_service.start_expiry_worker())
    yield
    # Shutdown
    expiry_task.cancel()
    logger.info("AgentGuard Gateway shutting down.")

app = FastAPI(
    title="AgentGuard Security Gateway",
    description="AI Agent Safety, Control & Interception Gateway",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin Auth Helper
def verify_admin(authorization: Optional[str] = Header(None)):
    if not authorization:
        # For development / hackathon demo convenience, allow access if header not passed,
        # but if passed, it must match the ADMIN_TOKEN.
        return True
    if authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        if token != ADMIN_TOKEN:
            raise HTTPException(status_code=401, detail="Invalid admin token.")
    return True

# Pydantic Schemas
class ExecuteRequest(BaseModel):
    agent_id: str
    task_context: str
    tool: str
    args: Dict[str, Any] = Field(default_factory=dict)

class ReviewRequest(BaseModel):
    reviewer: str = "security_lead"
    note: str = "Reviewed in dashboard"

# Health Check
@app.get("/health")
async def health():
    return {"status": "ok", "service": "AgentGuard", "version": "1.0.0"}

# Agent Execution Pipeline
@app.post("/v1/execute")
async def execute_action(req: ExecuteRequest, x_agent_key: Optional[str] = Header(None)):
    result = await gateway.execute(req.dict(), agent_key=x_agent_key)
    if "status_code" in result:
        status_code = result.pop("status_code")
        return JSONResponse(status_code=status_code, content=result)
    return result

# Agent Polling for Escalated Actions
@app.get("/v1/actions/{action_id}")
async def get_action_status(action_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM actions WHERE id = ?", (action_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Action not found.")
        
        result_val = json.loads(row["result_json"]) if row["result_json"] else None
        return {
            "id": row["id"],
            "agent_id": row["agent_id"],
            "tool": row["tool"],
            "decision": row["decision"],
            "status": row["status"],
            "risk_score": row["risk_score"],
            "result": result_val
        }

# Dashboard API: Actions Feed
@app.get("/api/actions")
async def list_actions(
    agent_id: Optional[str] = None,
    decision: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200)
):
    query = "SELECT * FROM actions"
    params = []
    conditions = []
    if agent_id:
        conditions.append("agent_id = ?")
        params.append(agent_id)
    if decision:
        conditions.append("decision = ?")
        params.append(decision.upper())

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, tuple(params))
        rows = await cursor.fetchall()
        actions = []
        for r in rows:
            actions.append({
                "id": r["id"],
                "agent_id": r["agent_id"],
                "task_context": r["task_context"],
                "tool": r["tool"],
                "args": json.loads(r["args_json"]) if r["args_json"] else {},
                "decision": r["decision"],
                "status": r["status"],
                "risk_score": r["risk_score"],
                "rule_ids": json.loads(r["rule_ids"]) if r["rule_ids"] else [],
                "judge": json.loads(r["judge_json"]) if r["judge_json"] else None,
                "result": json.loads(r["result_json"]) if r["result_json"] else None,
                "created_at": r["created_at"],
                "decided_at": r["decided_at"]
            })
        return {"actions": actions, "count": len(actions)}

# Dashboard API: Approvals
@app.get("/api/approvals")
async def list_approvals(status: Optional[str] = None):
    query = """
        SELECT appr.id as approval_id, appr.action_id, appr.status as approval_status,
               appr.reviewer, appr.note, appr.created_at as submitted_at,
               act.agent_id, act.task_context, act.tool, act.args_json, act.risk_score, act.rule_ids
        FROM approvals appr
        JOIN actions act ON appr.action_id = act.id
    """
    params = []
    if status:
        query += " WHERE appr.status = ?"
        params.append(status)
    query += " ORDER BY appr.created_at DESC"

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, tuple(params))
        rows = await cursor.fetchall()
        results = []
        for r in rows:
            results.append({
                "id": r["approval_id"],
                "action_id": r["action_id"],
                "status": r["approval_status"],
                "reviewer": r["reviewer"],
                "note": r["note"],
                "created_at": r["submitted_at"],
                "agent_id": r["agent_id"],
                "task_context": r["task_context"],
                "tool": r["tool"],
                "args": json.loads(r["args_json"]) if r["args_json"] else {},
                "risk_score": r["risk_score"],
                "rule_ids": json.loads(r["rule_ids"]) if r["rule_ids"] else []
            })
        return {"approvals": results}

@app.post("/api/approvals/{approval_id}/approve")
async def approve_action(approval_id: str, req: ReviewRequest = ReviewRequest()):
    res = await approval_service.approve(approval_id, reviewer=req.reviewer, note=req.note)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/approvals/{approval_id}/deny")
async def deny_action(approval_id: str, req: ReviewRequest = ReviewRequest()):
    res = await approval_service.deny(approval_id, reviewer=req.reviewer, note=req.note)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

# Dashboard API: Alerts
@app.get("/api/alerts")
async def list_alerts(acknowledged: Optional[int] = None):
    query = "SELECT * FROM alerts"
    params = []
    if acknowledged is not None:
        query += " WHERE acknowledged = ?"
        params.append(acknowledged)
    query += " ORDER BY created_at DESC"

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, tuple(params))
        rows = await cursor.fetchall()
        return {"alerts": [dict(r) for r in rows]}

@app.post("/api/alerts/{alert_id}/ack")
async def acknowledge_alert(alert_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
        await db.commit()
    return {"success": True, "alert_id": alert_id}

# Dashboard API: Agents Controls & Kill Switch
@app.get("/api/agents")
async def list_agents():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT id, role, status, created_at FROM agents")
        rows = await cursor.fetchall()
        
        agents_data = []
        for r in rows:
            # Get action count for agent
            act_cur = await db.execute("SELECT COUNT(*) as count FROM actions WHERE agent_id = ?", (r["id"],))
            act_row = await act_cur.fetchone()
            agents_data.append({
                "id": r["id"],
                "role": r["role"],
                "status": r["status"],
                "created_at": r["created_at"],
                "total_actions": act_row["count"] if act_row else 0
            })
        return {"agents": agents_data}

@app.post("/api/agents/{agent_id}/pause")
async def pause_agent(agent_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE agents SET status = 'PAUSED' WHERE id = ? AND status != 'KILLED'", (agent_id,))
        await db.commit()

    await append_audit_entry("AGENT_PAUSED", agent_id, None, "human:admin", {"status": "PAUSED"})
    await manager.broadcast("agent", {"agent_id": agent_id, "status": "PAUSED"})
    return {"success": True, "agent_id": agent_id, "status": "PAUSED"}

@app.post("/api/agents/{agent_id}/resume")
async def resume_agent(agent_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE agents SET status = 'ACTIVE' WHERE id = ? AND status != 'KILLED'", (agent_id,))
        await db.commit()

    await append_audit_entry("AGENT_RESUMED", agent_id, None, "human:admin", {"status": "ACTIVE"})
    await manager.broadcast("agent", {"agent_id": agent_id, "status": "ACTIVE"})
    return {"success": True, "agent_id": agent_id, "status": "ACTIVE"}

@app.post("/api/agents/{agent_id}/kill")
async def kill_agent(agent_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        # Revoke API key permanently and set status to KILLED
        await db.execute("UPDATE agents SET status = 'KILLED', api_key_hash = NULL WHERE id = ?", (agent_id,))
        await db.commit()

    await append_audit_entry("AGENT_KILLED", agent_id, None, "human:admin", {"status": "KILLED", "key_revoked": True})
    await manager.broadcast("agent", {"agent_id": agent_id, "status": "KILLED"})
    return {"success": True, "agent_id": agent_id, "status": "KILLED", "message": "Agent killed. Key revoked permanently."}

# Dashboard API: Audit Log & Chain Verification
@app.get("/api/audit")
async def get_audit_log(limit: int = Query(100, ge=1, le=500)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?", (limit,))
        rows = await cursor.fetchall()
        entries = []
        for r in rows:
            entries.append({
                "seq": r["seq"],
                "ts": r["ts"],
                "agent_id": r["agent_id"],
                "action_id": r["action_id"],
                "event_type": r["event_type"],
                "actor": r["actor"],
                "payload": json.loads(r["payload_json"]) if r["payload_json"] else {},
                "prev_hash": r["prev_hash"],
                "hash": r["hash"]
            })
        return {"audit_log": entries, "count": len(entries)}

@app.get("/api/audit/verify")
async def verify_audit_chain():
    return await verify_chain()

# Dashboard API: Aggregated Metrics / Stats
@app.get("/api/stats")
async def get_stats():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        # Actions stats
        cursor = await db.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN decision = 'BLOCK' THEN 1 ELSE 0 END) as blocked,
                SUM(CASE WHEN decision = 'ESCALATE' THEN 1 ELSE 0 END) as escalated,
                SUM(CASE WHEN decision = 'ALLOW' THEN 1 ELSE 0 END) as allowed
            FROM actions
        """)
        row = await cursor.fetchone()
        total_actions = row["total"] or 0
        blocked_actions = row["blocked"] or 0
        escalated_actions = row["escalated"] or 0
        allowed_actions = row["allowed"] or 0
        block_rate = round((blocked_actions / total_actions * 100), 1) if total_actions > 0 else 0.0

        # Pending approvals
        cursor = await db.execute("SELECT COUNT(*) as pending FROM approvals WHERE status = 'pending'")
        appr_row = await cursor.fetchone()
        pending_approvals = appr_row["pending"] or 0

        # Active alerts
        cursor = await db.execute("SELECT COUNT(*) as active FROM alerts WHERE acknowledged = 0")
        alt_row = await cursor.fetchone()
        active_alerts = alt_row["active"] or 0

        # Agents
        cursor = await db.execute("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active FROM agents")
        ag_row = await cursor.fetchone()
        total_agents = ag_row["total"] or 0
        active_agents = ag_row["active"] or 0

        return {
            "total_actions": total_actions,
            "blocked_actions": blocked_actions,
            "escalated_actions": escalated_actions,
            "allowed_actions": allowed_actions,
            "block_rate_pct": block_rate,
            "pending_approvals": pending_approvals,
            "active_alerts": active_alerts,
            "total_agents": total_agents,
            "active_agents": active_agents
        }

# Live Feed WebSocket
@app.websocket("/ws/feed")
async def websocket_feed(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep-alive receive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
        manager.disconnect(websocket)
