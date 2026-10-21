import test from 'node:test';
import assert from 'node:assert/strict';
import { recordAndCheckAnomaly } from '../anomaly.js';
import { getDb } from '../db.js';

test('Anomaly Detector: 5 destructive calls in 60s auto-pauses agent', () => {
  const db = getDb();
  const agentId = 'ops-agent';

  // Ensure active
  db.prepare("UPDATE agents SET status = 'ACTIVE' WHERE id = ?").run(agentId);

  let anomalyTriggered = false;
  for (let i = 1; i <= 5; i++) {
    const res = recordAndCheckAnomaly({
      agent_id: agentId,
      tool: 'db.query',
      decision: 'BLOCK',
      action_id: `act_burst_${i}`,
      args: { sql: `DROP TABLE test_${i}` }
    });
    if (res.triggered && res.autoPaused) {
      anomalyTriggered = true;
    }
  }

  assert.equal(anomalyTriggered, true);

  // Agent in DB must now be PAUSED
  const agent = db.prepare('SELECT status FROM agents WHERE id = ?').get(agentId);
  assert.equal(agent.status, 'PAUSED');

  // Critical alert must have been generated
  const alert = db.prepare("SELECT * FROM alerts WHERE agent_id = ? AND type = 'anomaly' ORDER BY created_at DESC LIMIT 1").get(agentId);
  assert.ok(alert);
  assert.equal(alert.severity, 'critical');

  // Reset to ACTIVE for other tests
  db.prepare("UPDATE agents SET status = 'ACTIVE' WHERE id = ?").run(agentId);
});
