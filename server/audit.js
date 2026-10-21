import crypto from 'crypto';
import { getDb } from './db.js';
import { redactSensitiveData } from './adapters/index.js';

export const GENESIS_HASH = 'GENESIS';

/**
 * Produce deterministic canonical JSON with recursively sorted object keys.
 */
export function canonicalJSON(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    return '[' + val.map(canonicalJSON).join(',') + ']';
  }

  const keys = Object.keys(val).sort();
  const entries = keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(val[k]));
  return '{' + entries.join(',') + '}';
}

/**
 * Calculates SHA-256 hash from previous hash + canonical entry payload.
 */
export function computeHash(prevHash, entry) {
  const content = prevHash + canonicalJSON(entry);
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Appends a tamper-evident audit record to the ledger in a serialized transaction.
 */
export function appendAuditEntry({ agent_id = null, action_id = null, event_type, actor, payload = {} }) {
  const db = getDb();
  const safePayload = redactSensitiveData(payload);

  const insertTx = db.transaction(() => {
    // Get last hash
    const lastRow = db.prepare('SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1').get();
    const prevHash = lastRow ? lastRow.hash : GENESIS_HASH;
    const ts = new Date().toISOString();

    const entryToHash = {
      ts,
      agent_id: agent_id || null,
      action_id: action_id || null,
      event_type,
      actor,
      payload: safePayload
    };

    const currentHash = computeHash(prevHash, entryToHash);

    const result = db.prepare(`
      INSERT INTO audit_log (ts, agent_id, action_id, event_type, actor, payload_json, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ts,
      agent_id || null,
      action_id || null,
      event_type,
      actor,
      JSON.stringify(safePayload),
      prevHash,
      currentHash
    );

    return {
      seq: result.lastInsertRowid,
      ts,
      agent_id,
      action_id,
      event_type,
      actor,
      payload: safePayload,
      prev_hash: prevHash,
      hash: currentHash
    };
  });

  return insertTx();
}

/**
 * Recomputes the entire audit ledger from sequence 1 to latest, verifying every link.
 */
export function verifyAuditChain() {
  const db = getDb();
  const rows = db.prepare('SELECT seq, ts, agent_id, action_id, event_type, actor, payload_json, prev_hash, hash FROM audit_log ORDER BY seq ASC').all();

  let expectedPrevHash = GENESIS_HASH;
  let checked = 0;

  for (const row of rows) {
    checked++;

    if (row.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        checked,
        firstBadSeq: row.seq,
        reason: `Previous hash mismatch at Seq #${row.seq}. Expected ${expectedPrevHash}, found ${row.prev_hash}`
      };
    }

    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = row.payload_json;
    }

    const entryToHash = {
      ts: row.ts,
      agent_id: row.agent_id,
      action_id: row.action_id,
      event_type: row.event_type,
      actor: row.actor,
      payload
    };

    const expectedHash = computeHash(expectedPrevHash, entryToHash);
    if (expectedHash !== row.hash) {
      return {
        ok: false,
        checked,
        firstBadSeq: row.seq,
        reason: `Hash mismatch at Seq #${row.seq}. Recalculated ${expectedHash}, recorded ${row.hash}`
      };
    }

    expectedPrevHash = row.hash;
  }

  return {
    ok: true,
    checked,
    firstBadSeq: null
  };
}
