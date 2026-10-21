import os
import pytest
import asyncio
import aiosqlite
from app.models import init_db
from app.audit import append_audit_entry, verify_chain

TEST_AUDIT_DB = "test_audit.db"

@pytest.fixture(autouse=True)
async def setup_audit_db(monkeypatch):
    monkeypatch.setenv("DB_PATH", TEST_AUDIT_DB)
    import app.models as models
    models.DB_PATH = TEST_AUDIT_DB
    import app.audit as audit
    audit.DB_PATH = TEST_AUDIT_DB

    if os.path.exists(TEST_AUDIT_DB):
        try:
            os.remove(TEST_AUDIT_DB)
        except Exception:
            pass

    await init_db(TEST_AUDIT_DB)
    yield

    if os.path.exists(TEST_AUDIT_DB):
        try:
            os.remove(TEST_AUDIT_DB)
        except Exception:
            pass

@pytest.mark.asyncio
async def test_audit_chain_and_tamper_detection():
    # Append 5 sequential audit entries
    for i in range(1, 6):
        await append_audit_entry(
            event_type=f"EVENT_{i}",
            agent_id="test-agent",
            action_id=f"act_{i}",
            actor="test",
            payload={"step": i, "details": f"audit entry number {i}"}
        )

    # Initial chain verification should pass
    res = await verify_chain()
    assert res["ok"] is True
    assert res["checked"] == 5
    assert res["first_bad_seq"] is None

    # Now tamper with row 3 directly in SQLite
    async with aiosqlite.connect(TEST_AUDIT_DB) as db:
        await db.execute("UPDATE audit_log SET payload_json = '{\"tampered\": true}' WHERE seq = 3")
        await db.commit()

    # Re-verify should immediately detect tamper at seq 3
    tamper_res = await verify_chain()
    assert tamper_res["ok"] is False
    assert tamper_res["first_bad_seq"] == 3
    assert "Tamper detected" in tamper_res["message"]
