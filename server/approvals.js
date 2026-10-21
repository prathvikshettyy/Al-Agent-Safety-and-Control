import { getDb } from './db.js';
import { executeAdapter, redactSensitiveData } from './adapters/index.js';
import { appendAuditEntry } from './audit.js';
import { broadcast } from './broadcast.js';
import crypto from 'crypto';

/**
 * Creates a new pending approval record for an escalated action.
 */
export function createApproval(actionId) {
  const db = getDb();
  const approvalId = `appr_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO approvals (id, action_id, status, reviewer, note, created_at, resolved_at)
    VALUES (?, ?, 'pending', NULL, NULL, ?, NULL)
  `).run(approvalId, actionId, now);

  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId);
  return approval;
}

/**
 * Executes human approval on an escalated action idempotently.
 */
export async function approveAction(approvalId, reviewer = 'admin', note = '') {
  const db = getDb();

  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId);
  if (!approval) {
    throw new Error(`Approval record '${approvalId}' not found`);
  }

  // Idempotency: if already approved or resolved, do not re-execute!
  if (approval.status !== 'pending') {
    return {
      status: approval.status,
      message: `Approval already resolved as '${approval.status}'`,
      approval
    };
  }

  const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(approval.action_id);
  if (!action) {
    throw new Error(`Associated action '${approval.action_id}' not found`);
  }

  // Re-check agent status: must not be KILLED or PAUSED
  const agent = db.prepare('SELECT id, status FROM agents WHERE id = ?').get(action.agent_id);
  if (!agent || agent.status === 'KILLED' || agent.status === 'PAUSED') {
    throw new Error(`Cannot approve action: Agent '${action.agent_id}' is currently ${agent ? agent.status : 'UNKNOWN'}`);
  }

  const now = new Date().toISOString();
  let args = {};
  try {
    args = JSON.parse(action.args_json);
  } catch (e) {
    args = {};
  }

  // Execute adapter
  let result;
  try {
    result = await executeAdapter(action.tool, args);
  } catch (err) {
    // If execution fails, record error
    result = { error: err.message, failed: true };
  }

  // Update records in transaction
  db.transaction(() => {
    db.prepare(`
      UPDATE approvals
      SET status = 'approved', reviewer = ?, note = ?, resolved_at = ?
      WHERE id = ?
    `).run(reviewer, note || 'Approved by supervisor', now, approvalId);

    db.prepare(`
      UPDATE actions
      SET status = 'executed', result_json = ?
      WHERE id = ?
    `).run(JSON.stringify(redactSensitiveData(result)), action.id);
  })();

  // Append audit entries
  appendAuditEntry({
    agent_id: action.agent_id,
    action_id: action.id,
    event_type: 'APPROVED',
    actor: `human:${reviewer}`,
    payload: {
      approval_id: approvalId,
      note
    }
  });

  appendAuditEntry({
    agent_id: action.agent_id,
    action_id: action.id,
    event_type: 'EXECUTED',
    actor: `human:${reviewer}`,
    payload: {
      tool: action.tool,
      result: redactSensitiveData(result)
    }
  });

  const updatedApproval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId);
  const updatedAction = db.prepare('SELECT * FROM actions WHERE id = ?').get(action.id);

  broadcast('approval', updatedApproval);
  broadcast('action', updatedAction);

  return {
    success: true,
    status: 'approved',
    result,
    approval: updatedApproval,
    action: updatedAction
  };
}

/**
 * Denies an escalated action. Tool adapter is NEVER executed.
 */
export async function denyAction(approvalId, reviewer = 'admin', note = '') {
  const db = getDb();

  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId);
  if (!approval) {
    throw new Error(`Approval record '${approvalId}' not found`);
  }

  if (approval.status !== 'pending') {
    return {
      status: approval.status,
      message: `Approval already resolved as '${approval.status}'`,
      approval
    };
  }

  const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(approval.action_id);
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      UPDATE approvals
      SET status = 'denied', reviewer = ?, note = ?, resolved_at = ?
      WHERE id = ?
    `).run(reviewer, note || 'Denied by supervisor', now, approvalId);

    if (action) {
      db.prepare(`
        UPDATE actions
        SET status = 'denied'
        WHERE id = ?
      `).run(action.id);
    }
  })();

  appendAuditEntry({
    agent_id: action ? action.agent_id : null,
    action_id: approval.action_id,
    event_type: 'DENIED',
    actor: `human:${reviewer}`,
    payload: {
      approval_id: approvalId,
      note
    }
  });

  const updatedApproval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId);
  const updatedAction = action ? db.prepare('SELECT * FROM actions WHERE id = ?').get(action.id) : null;

  broadcast('approval', updatedApproval);
  if (updatedAction) broadcast('action', updatedAction);

  return {
    success: true,
    status: 'denied',
    approval: updatedApproval,
    action: updatedAction
  };
}

/**
 * Auto-expires pending approvals older than 10 minutes.
 */
export function expireStaleApprovals() {
  const db = getDb();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const stale = db.prepare(`
    SELECT id, action_id FROM approvals
    WHERE status = 'pending' AND created_at < ?
  `).all(tenMinutesAgo);

  for (const item of stale) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE approvals
      SET status = 'expired', resolved_at = ?
      WHERE id = ?
    `).run(now, item.id);

    db.prepare(`
      UPDATE actions
      SET status = 'expired'
      WHERE id = ?
    `).run(item.action_id);

    appendAuditEntry({
      action_id: item.action_id,
      event_type: 'EXPIRED',
      actor: 'system',
      payload: {
        approval_id: item.id,
        reason: 'Approval window exceeded 10-minute validity threshold'
      }
    });

    const updated = db.prepare('SELECT * FROM approvals WHERE id = ?').get(item.id);
    broadcast('approval', updated);
  }

  return stale.length;
}

let workerInterval = null;
export function initApprovalsWorker() {
  if (workerInterval) clearInterval(workerInterval);
  workerInterval = setInterval(() => {
    try {
      expireStaleApprovals();
    } catch (err) {
      console.error('Error in approval expiry worker:', err);
    }
  }, 30000); // Check every 30 seconds
}
