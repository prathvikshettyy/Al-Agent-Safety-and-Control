import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

function wrapDatabase(rawDb) {
  return {
    raw: rawDb,
    exec(sql) {
      return rawDb.exec(sql);
    },
    pragma(sql) {
      try {
        return rawDb.exec(`PRAGMA ${sql};`);
      } catch {
        // Ignored if pragma not applicable
      }
    },
    prepare(sql) {
      const stmt = rawDb.prepare(sql);
      return {
        get(...params) {
          return stmt.get(...params);
        },
        all(...params) {
          return stmt.all(...params);
        },
        run(...params) {
          const res = stmt.run(...params);
          return {
            changes: Number(res.changes),
            lastInsertRowid: Number(res.lastInsertRowid)
          };
        }
      };
    },
    transaction(fn) {
      return (...args) => {
        rawDb.exec('BEGIN;');
        try {
          const result = fn(...args);
          rawDb.exec('COMMIT;');
          return result;
        } catch (err) {
          rawDb.exec('ROLLBACK;');
          throw err;
        }
      };
    },
    close() {
      rawDb.close();
    }
  };
}

export function getDb(customPath = null) {
  if (dbInstance) return dbInstance;

  const dbPath = customPath || process.env.DB_PATH || path.resolve(__dirname, '..', 'agentguard.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const rawDb = new DatabaseSync(dbPath);
  dbInstance = wrapDatabase(rawDb);
  dbInstance.pragma('busy_timeout = 5000');
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  initSchema(dbInstance);
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'PAUSED', 'KILLED')),
      api_key_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      task_context TEXT,
      tool TEXT NOT NULL,
      args_json TEXT NOT NULL,
      decision TEXT NOT NULL,
      status TEXT NOT NULL,
      risk_score REAL NOT NULL,
      rule_ids TEXT,
      judge_json TEXT,
      result_json TEXT,
      tainted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      decided_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      action_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'denied', 'expired')),
      reviewer TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      action_id TEXT,
      acknowledged INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      agent_id TEXT,
      action_id TEXT,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      tier TEXT NOT NULL,
      balance REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      sent_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments_ledger (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sandbox_db (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_actions_agent ON actions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_actions_created ON actions(created_at);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_ack ON alerts(acknowledged, severity);
    CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit_log(seq);
  `);
}
