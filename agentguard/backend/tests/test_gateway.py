import os
import pytest
import asyncio
from app.models import init_db
from app.gateway import gateway
from app.approvals import approval_service

TEST_DB = "test_agentguard.db"

@pytest.fixture(autouse=True)
async def setup_test_db(monkeypatch):
    monkeypatch.setenv("DB_PATH", TEST_DB)
    import app.models as models
    models.DB_PATH = TEST_DB
    import app.audit as audit
    audit.DB_PATH = TEST_DB
    import app.gateway as gw
    gw.DB_PATH = TEST_DB
    import app.approvals as appr
    appr.DB_PATH = TEST_DB
    import app.anomaly as anom
    anom.DB_PATH = TEST_DB

    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass

    await init_db(TEST_DB)
    
    # Insert test agents
    import aiosqlite
    import hashlib
    async with aiosqlite.connect(TEST_DB) as db:
        h1 = hashlib.sha256("test-key-1".encode()).hexdigest()
        await db.execute("INSERT INTO agents (id, role, status, api_key_hash) VALUES ('support-agent-1', 'customer_support', 'ACTIVE', ?)", (h1,))
        await db.execute("INSERT INTO agents (id, role, status, api_key_hash) VALUES ('paused-agent', 'customer_support', 'PAUSED', 'hash')")
        await db.execute("INSERT INTO agents (id, role, status, api_key_hash) VALUES ('killed-agent', 'customer_support', 'KILLED', 'hash')")
        await db.commit()

    yield

    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass

@pytest.mark.asyncio
async def test_unknown_agent():
    res = await gateway.execute({
        "agent_id": "non-existent-agent",
        "task_context": "testing",
        "tool": "crm.read_customer",
        "args": {"customer_id": "c_101"}
    })
    assert res.get("status_code") == 401

@pytest.mark.asyncio
async def test_paused_agent():
    res = await gateway.execute({
        "agent_id": "paused-agent",
        "task_context": "testing",
        "tool": "crm.read_customer",
        "args": {"customer_id": "c_101"}
    })
    assert res.get("status_code") == 403

@pytest.mark.asyncio
async def test_killed_agent():
    res = await gateway.execute({
        "agent_id": "killed-agent",
        "task_context": "testing",
        "tool": "crm.read_customer",
        "args": {"customer_id": "c_101"}
    })
    assert res.get("status_code") == 403

@pytest.mark.asyncio
async def test_allowed_crm_read():
    res = await gateway.execute({
        "agent_id": "support-agent-1",
        "task_context": "Look up customer information",
        "tool": "crm.read_customer",
        "args": {"customer_id": "c_101"}
    }, agent_key="test-key-1")
    assert res["decision"] == "ALLOW"
    assert res["status"] == "executed"
    assert res["result"]["id"] == "c_101"

@pytest.mark.asyncio
async def test_escalated_refund_and_approve():
    res = await gateway.execute({
        "agent_id": "support-agent-1",
        "task_context": "Issue refund for customer complaint",
        "tool": "payments.refund",
        "args": {"customer_id": "c_102", "amount": 4500, "currency": "INR"}
    }, agent_key="test-key-1")
    assert res["decision"] == "ESCALATE"
    assert res["status"] == "pending"
    action_id = res["action_id"]

    # Check pending approvals
    import aiosqlite
    async with aiosqlite.connect(TEST_DB) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT id FROM approvals WHERE action_id = ?", (action_id,))
        appr_row = await cur.fetchone()
        assert appr_row is not None
        approval_id = appr_row["id"]

    # Human approves
    appr_res = await approval_service.approve(approval_id, reviewer="alice_lead", note="Legitimate warranty issue")
    assert appr_res["success"] is True
    assert appr_res["result"]["amount_refunded"] == 4500
