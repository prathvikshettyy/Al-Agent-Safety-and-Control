import { getDb } from './db.js';
import { broadcast } from './broadcast.js';
import crypto from 'crypto';

// Injection signatures and prompt override heuristics
const INJECTION_PATTERNS = [
  /ignore\s+(?:previous|all|above)\s+instructions/i,
  /system\s+prompt/i,
  /disregard\s+(?:prior|previous)\s+directives/i,
  /forward\s+(?:all|customer|data|database)\s+to/i,
  /send\s+(?:all|customer|data|database)\s+to/i,
  /exfiltrate/i,
  /attacker@/i,
  /@evil\.com/i,
  /leak\s+(?:all|credentials|keys|passwords)/i,
  /you\s+are\s+now\s+in\s+DAN\s+mode/i,
  /admin\s+override\s+code/i
];

// In-memory taint registry per agent
const taintedAgents = new Map();

/**
 * Scans content (e.g. from read_customer, read_ticket, or task_context) for prompt injection payload signatures.
 */
export function scanForInjection(content) {
  if (!content) return { detected: false, matches: [] };

  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const matches = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(pattern.toString());
    }
  }

  return {
    detected: matches.length > 0,
    matches
  };
}

/**
 * Marks an agent session as tainted, persists an alert, and broadcasts.
 */
export function taintAgent(agentId, reason, sourcePayload = null, actionId = null) {
  const taintRecord = {
    agentId,
    reason,
    sourcePayload,
    actionId,
    taintedAt: new Date().toISOString()
  };

  taintedAgents.set(agentId, taintRecord);

  const db = getDb();
  const alertId = `alert_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO alerts (id, agent_id, severity, type, message, action_id, acknowledged, created_at)
    VALUES (?, ?, 'critical', 'injection', ?, ?, 0, ?)
  `).run(
    alertId,
    agentId,
    `Prompt injection taint detected: ${reason}`,
    actionId || null,
    now
  );

  broadcast('alert', {
    id: alertId,
    agent_id: agentId,
    severity: 'critical',
    type: 'injection',
    message: `Prompt injection taint detected: ${reason}`,
    action_id: actionId,
    acknowledged: 0,
    created_at: now
  });

  return taintRecord;
}

/**
 * Returns taint status for an agent.
 */
export function isAgentTainted(agentId) {
  if (!agentId) return { tainted: false };
  const record = taintedAgents.get(agentId);
  if (!record) return { tainted: false };

  return {
    tainted: true,
    reason: record.reason,
    taintedAt: record.taintedAt,
    actionId: record.actionId
  };
}

/**
 * Clears taint state when agent is sanitized.
 */
export function clearAgentTaint(agentId) {
  taintedAgents.delete(agentId);
}

export function clearAllTaints() {
  taintedAgents.clear();
}
