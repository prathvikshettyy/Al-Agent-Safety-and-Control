import os
import sys
import hashlib
import asyncio
import aiosqlite

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from app.models import init_db, DB_PATH
from app.audit import append_audit_entry

async def seed_data():
    print(f"[*] Initializing and seeding database at: {DB_PATH}")
    await init_db()

    async with aiosqlite.connect(DB_PATH) as db:
        # Seed Agents
        agents = [
            ("support-agent-1", "customer_support", "key-support-secret-1"),
            ("ops-agent-2", "operations", "key-ops-secret-2")
        ]
        for aid, role, key in agents:
            key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()
            await db.execute("""
                INSERT INTO agents (id, role, status, api_key_hash)
                VALUES (?, ?, 'ACTIVE', ?)
                ON CONFLICT(id) DO UPDATE SET status='ACTIVE', api_key_hash=excluded.api_key_hash
            """, (aid, role, key_hash))
            print(f"[+] Seeded agent: {aid} (Role: {role}, Key: {key})")

        # Seed mock customers
        customers = [
            ("c_101", "Alice Vance", "alice@company.com", "enterprise", 450.00),
            ("c_102", "Jane Doe", "jane.doe@partner.org", "pro", 4500.00),
            ("c_103", "Eve Mallory", "eve@external-risk.net", "basic", 50.00)
        ]
        for cid, name, email, tier, bal in customers:
            await db.execute("""
                INSERT INTO mock_customers (id, name, email, tier, balance)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET balance=excluded.balance
            """, (cid, name, email, tier, bal))
            print(f"[+] Seeded mock customer: {name} ({cid})")

        # Seed system balance
        await db.execute("""
            INSERT INTO mock_system_balance (id, total_funds)
            VALUES (1, 1000000.00)
            ON CONFLICT(id) DO NOTHING
        """)

        await db.commit()

    # Create genesis audit log entries
    await append_audit_entry(
        event_type="POLICY_RELOADED",
        agent_id=None,
        action_id=None,
        actor="system:boot",
        payload={"version": "1.0.0", "status": "policies loaded successfully"}
    )
    print("[+] Seeded genesis audit log entry.")
    print("[OK] Seeding completed successfully.")

if __name__ == "__main__":
    asyncio.run(seed_data())
