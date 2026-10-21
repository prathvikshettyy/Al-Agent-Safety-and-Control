import { getDb } from './db.js';
import { appendAuditEntry } from './audit.js';
import { broadcast } from './broadcast.js';
import crypto from 'crypto';

// In-memory sliding window history per agent
const agentHistory = new Map();

function getHistory(agentId) {
  if (!agentHistory.has(agentId)) {
    agentHistory.set(agentId, []);
  }
  return agentHistory.get(agentId);
}

/**
 * Feeds a recorded action into the sliding-window anomaly detector.
 */
export function recordAndCheckAnomaly({ agent_id, tool, decision, action_id, args = {} }) {
  const now = Date.now();
  const history = getHistory(agent_id);

  const isDestructive = (
    tool === 'db.query' ||
    (args && args.sql && /\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(String(args.sql)))
  );

  history.push({
    ts: now,
    tool,
    decision,
    action_id,
    isDestructive
  });

  // Prune history older than 180 seconds
  const cutoff = now - 180000;
  while (history.length > 0 && history[0].ts < cutoff) {
    history.shift();
  }

  // 1. Check: 5 destructive calls in 60s
  const last60s = now - 60000;
  const destructiveCount = history.filter(h => h.ts >= last60s && h.isDestructive).length;
  if (destructiveCount >= 5) {
    return triggerAutoPause(
      agent_id,
      `Anomaly: High frequency of destructive operations (${destructiveCount} calls in 60s)`,
      action_id
    );
  }

  // 2. Check: 5 BLOCKs in 120s
  const last120s = now - 120000;
  const blocksCount = history.filter(h => h.ts >= last120s && h.decision === 'BLOCK').length;
  if (blocksCount >= 5) {
    return triggerAutoPause(
      agent_id,
      `Anomaly: Excessive policy rejections (${blocksCount} blocked actions in 120s)`,
      action_id
    );
  }

  // 3. Velocity check (actions/minute)
  const actionsIn60s = history.filter(h => h.ts >= last60s).length;
  const velocityBurstThreshold = 60; // 60 actions/minute
  if (actionsIn60s >= velocityBurstThreshold) {
    return triggerAutoPause(
      agent_id,
      `Anomaly: Runaway execution burst (${actionsIn60s} actions in 60s)`,
      action_id
    );
  }

  return {
    triggered: false,
    autoPaused: false,
    recentActionsIn60s: actionsIn60s,
    burstFactor: actionsIn60s > 20 ? 20 : 0
  };
}

/**
 * Triggers an immediate emergency auto-pause on an anomalous agent.
 */
function triggerAutoPause(agentId, reason, actionId) {
  const db = getDb();

  // Check if agent is already PAUSED or KILLED
  const agent = db.prepare('SELECT id, status FROM agents WHERE id = ?').get(agentId);
  if (!agent || agent.status === 'PAUSED' || agent.status === 'KILLED') {
    return { triggered: true, autoPaused: false, reason };
  }

  // Set agent to PAUSED
  db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('PAUSED', agentId);

  // Create critical alert
  const alertId = `alert_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO alerts (id, agent_id, severity, type, message, action_id, acknowledged, created_at)
    VALUES (?, ?, 'critical', 'anomaly', ?, ?, 0, ?)
  `).run(alertId, agentId, reason, actionId || null, now);

  // Append audit entry
  appendAuditEntry({
    agent_id: agentId,
    action_id: actionId,
    event_type: 'AGENT_PAUSED',
    actor: 'system',
    payload: {
      reason,
      automated: true
    }
  });

  // Broadcast
  broadcast('agent', { id: agentId, status: 'PAUSED', reason });
  broadcast('alert', {
    id: alertId,
    agent_id: agentId,
    severity: 'critical',
    type: 'anomaly',
    message: reason,
    action_id: actionId,
    acknowledged: 0,
    created_at: now
  });

  return {
    triggered: true,
    autoPaused: true,
    reason
  };
}

export function clearAnomalyHistory() {
  agentHistory.clear();
}
