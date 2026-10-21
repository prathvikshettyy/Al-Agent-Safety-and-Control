import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { appendAuditEntry, verifyAuditChain } from '../audit.js';
import { getDb } from '../db.js';

beforeEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM audit_log').run();
});

test('Audit Ledger: Verifies successfully after 50 sequential actions', () => {
  for (let i = 1; i <= 50; i++) {
    appendAuditEntry({
      agent_id: 'support-agent',
      action_id: `act_bulk_${i}`,
      event_type: 'ACTION_EXECUTE',
      actor: 'agent:support-agent',
      payload: { iteration: i, test: true, card: '4111-2222-3333-4444' }
    });
  }

  const result = verifyAuditChain();
  assert.equal(result.ok, true);
  assert.ok(result.checked >= 50);
  assert.equal(result.firstBadSeq, null);
});

test('Audit Ledger: Detects direct SQL tampering at exact sequence number', () => {
  const db = getDb();

  // Insert a test row
  const row = appendAuditEntry({
    agent_id: 'ops-agent',
    event_type: 'TAMPER_TEST',
    actor: 'test',
    payload: { valid: true }
  });

  // Verify before tampering
  const preCheck = verifyAuditChain();
  assert.equal(preCheck.ok, true);

  // Directly tamper the row's payload via raw SQL without updating hash
  db.prepare('UPDATE audit_log SET payload_json = ? WHERE seq = ?').run(
    JSON.stringify({ valid: false, malicious_insertion: true }),
    row.seq
  );

  // Verification must fail at this exact sequence!
  const postCheck = verifyAuditChain();
  assert.equal(postCheck.ok, false);
  assert.equal(postCheck.firstBadSeq, row.seq);
  assert.ok(postCheck.reason.includes(`Seq #${row.seq}`));
});
