import os
import aiosqlite
import logging

logger = logging.getLogger("agentguard.models")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "agentguard.db")
DB_PATH = os.path.abspath(os.environ.get("DB_PATH", DEFAULT_DB_PATH))

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  role TEXT,
  status TEXT CHECK(status IN ('ACTIVE','PAUSED','KILLED')) DEFAULT 'ACTIVE',
  api_key_hash TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  task_context TEXT,
  tool TEXT,
  args_json TEXT,
  decision TEXT,           -- ALLOW | BLOCK | ESCALATE
  status TEXT,             -- executed | blocked | pending | approved | denied | failed
  risk_score INTEGER,
  rule_ids TEXT,           -- JSON array
  judge_json TEXT,
  result_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  action_id TEXT REFERENCES actions(id),
  status TEXT,             -- pending | approved | denied | expired
  reviewer TEXT,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  severity TEXT,           -- low | medium | high | critical
  type TEXT,               -- rule_block | anomaly | injection | judge_flag | kill
  message TEXT,
  action_id TEXT,
  acknowledged INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  agent_id TEXT,
  action_id TEXT,
  event_type TEXT,
  actor TEXT,
  payload_json TEXT,
  prev_hash TEXT,
  hash TEXT
);

-- Mock sandbox tables for realistic tool adapter executions
CREATE TABLE IF NOT EXISTS mock_customers (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  tier TEXT,
  balance REAL
);

CREATE TABLE IF NOT EXISTS mock_tickets (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  subject TEXT,
  status TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS mock_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT,
  subject TEXT,
  body TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mock_system_balance (
  id INTEGER PRIMARY KEY,
  total_funds REAL
);
"""

async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db

async def init_db(db_path: str = None):
    global DB_PATH
    if db_path:
        DB_PATH = db_path
    logger.info(f"Initializing database at: {DB_PATH}")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA_SQL)
        
        # Initialize default system balance if empty
        cursor = await db.execute("SELECT COUNT(*) FROM mock_system_balance")
        row = await cursor.fetchone()
        if row[0] == 0:
            await db.execute("INSERT INTO mock_system_balance (id, total_funds) VALUES (1, 1000000.00)")
            
        # Seed mock customers if empty
        cursor = await db.execute("SELECT COUNT(*) FROM mock_customers")
        row = await cursor.fetchone()
        if row[0] == 0:
            await db.execute("INSERT INTO mock_customers (id, name, email, tier, balance) VALUES ('c_101', 'Alice Vance', 'alice@company.com', 'enterprise', 450.00)")
            await db.execute("INSERT INTO mock_customers (id, name, email, tier, balance) VALUES ('c_102', 'Jane Doe', 'jane.doe@partner.org', 'pro', 4500.00)")
            await db.execute("INSERT INTO mock_customers (id, name, email, tier, balance) VALUES ('c_103', 'Eve Mallory', 'eve@external-risk.net', 'basic', 50.00)")
            
        await db.commit()
    logger.info("Database initialized successfully.")
