import crypto from 'crypto';
import { getDb } from './db.js';
import { evaluatePolicy } from './policy.js';
import { calculateRiskScore } from './risk.js';
import { evaluateWithJudge } from './judge.js';
import { scanForInjection, taintAgent, isAgentTainted } from './injection.js';
import { recordAndCheckAnomaly } from './anomaly.js';
import { createApproval } from './approvals.js';
import { appendAuditEntry } from './audit.js';
import { executeAdapter, redactSensitiveData, SENSITIVE_TOOLS } from './adapters/index.js';
import { broadcast } from './broadcast.js';

// Sliding window in-memory rate limiter per agent
const agentRateTracker = new Map();

function checkRateLimit(agentId, maxPerMin = 30) {
  const now = Date.now();
  if (!agentRateTracker.has(agentId)) {
    agentRateTracker.set(agentId, []);
  }
  const timestamps = agentRateTracker.get(agentId);

  // Keep timestamps in the last 60 seconds
  const cutoff = now - 60000;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= maxPerMin) {
    return { ok: false, count: timestamps.length };
  }

  timestamps.push(now);
  return { ok: true, count: timestamps.length };
}

/**
 * Main AgentGuard Fail-Closed Execution Pipeline
 */
export async function executeGatewayAction({
  agent_id,
  task_context = '',
  tool,
  args = {},
  idempotency_key = null,
  raw_agent_key = null
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const actionId = `act_${crypto.randomBytes(8).toString('hex')}`;

  // STEP 1: Validate payload and Authenticate agent key
  if (!agent_id || !tool) {
    return {
      status_code: 400,
      body: {
        error: 'Missing required parameters: agent_id and tool are mandatory.',
        decision: 'BLOCK'
      }
    };
  }

  const agent = db.prepare('SELECT id, role, status, api_key_hash FROM agents WHERE id = ?').get(agent_id);
  if (!agent) {
    return {
      status_code: 401,
      body: {
        error: `Unauthorized: Unknown agent identifier '${agent_id}'`,
        decision: 'BLOCK'
      }
    };
  }

  if (raw_agent_key) {
    const keyHash = crypto.createHash('sha256').update(raw_agent_key).digest('hex');
    if (keyHash !== agent.api_key_hash) {
      return {
        status_code: 401,
        body: {
          error: 'Unauthorized: Invalid agent API key credentials.',
          decision: 'BLOCK'
        }
      };
    }
  }

  // STEP 2: Agent Status Check (Reject if PAUSED or KILLED)
  if (agent.status === 'KILLED') {
    return {
      status_code: 403,
      body: {
        action_id: actionId,
        decision: 'BLOCK',
        status: 'forbidden',
        reason: `Agent '${agent_id}' has been permanently KILLED via emergency kill-switch. All operations terminated.`
      }
    };
  }

  if (agent.status === 'PAUSED') {
    return {
      status_code: 403,
      body: {
        action_id: actionId,
        decision: 'BLOCK',
        status: 'paused',
        reason: `Agent '${agent_id}' is currently PAUSED pending administrative review.`
      }
    };
  }

  // STEP 3: Idempotency Check
  if (idempotency_key) {
    const existing = db.prepare('SELECT action_id FROM idempotency_keys WHERE key = ?').get(idempotency_key);
    if (existing) {
      const priorAction = db.prepare('SELECT * FROM actions WHERE id = ?').get(existing.action_id);
      if (priorAction) {
        let result = null;
        try {
          result = priorAction.result_json ? JSON.parse(priorAction.result_json) : null;
        } catch {}
        return {
          status_code: 200,
          body: {
            action_id: priorAction.id,
            decision: priorAction.decision,
            status: priorAction.status,
            reason: 'Replayed from idempotency cache',
            risk_score: priorAction.risk_score,
            result,
            replayed: true
          }
        };
      }
    }
  }

  // STEP 4: Rate Limiting
  const rateLimit = checkRateLimit(agent_id, 30);
  if (!rateLimit.ok) {
    return {
      status_code: 429,
      body: {
        action_id: actionId,
        decision: 'BLOCK',
        status: 'rate_limited',
        reason: `Rate limit exceeded: Agent '${agent_id}' exceeded 30 actions/minute capacity.`
      }
    };
  }

  // Record idempotency key if provided
  if (idempotency_key) {
    try {
      db.prepare('INSERT INTO idempotency_keys (key, action_id, created_at) VALUES (?, ?, ?)').run(idempotency_key, actionId, now);
    } catch {}
  }

  // STEP 5: Policy Evaluation (Deny by default)
  let policyResult;
  try {
    policyResult = evaluatePolicy(agent_id, tool, args);
  } catch (err) {
    // Fail closed
    policyResult = {
      allowed: false,
      decision: 'BLOCK',
      ruleIds: ['POLICY_ERROR'],
      reasons: [`Policy evaluation threw internal exception: ${err.message}`]
    };
  }

  // Scan input context/arguments for prompt injection attempts
  const inputScan = scanForInjection(JSON.stringify({ task_context, args }));
  if (inputScan.detected) {
    taintAgent(agent_id, `Injection payload in execution input (${inputScan.matches.join(', ')})`, { task_context, args }, actionId);
  }

  // STEP 6: Heuristic Risk Scoring & Taint Status
  const riskInfo = calculateRiskScore({
    agent_id,
    tool,
    args,
    task_context
  });

  // STEP 7: Optional LLM Judge
  let judgeResult = { evaluated: false };
  // Trigger judge if risk score in 30-70 grey-zone and policy is not already a hard BLOCK
  if (riskInfo.score >= 30 && riskInfo.score <= 70 && policyResult.decision !== 'BLOCK') {
    judgeResult = await evaluateWithJudge({
      agent_id,
      tool,
      args,
      task_context,
      risk_score: riskInfo.score
    });
  }

  // Combine Decisions:
  // Rule: any BLOCK wins; then ESCALATE; else ALLOW
  let finalDecision = 'ALLOW';
  const combinedReasons = [...policyResult.reasons, ...riskInfo.reasons];

  if (policyResult.decision === 'BLOCK') {
    finalDecision = 'BLOCK';
  } else if (policyResult.decision === 'ESCALATE') {
    finalDecision = 'ESCALATE';
  }

  // If Judge flagged misaligned with confidence > 0.7
  if (judgeResult.evaluated && !judgeResult.aligned && judgeResult.confidence >= 0.7) {
    if (SENSITIVE_TOOLS.has(tool)) {
      finalDecision = 'BLOCK';
      combinedReasons.push(`LLM Judge determined action is misaligned with high confidence (${judgeResult.reason})`);
    } else {
      if (finalDecision !== 'BLOCK') finalDecision = 'ESCALATE';
      combinedReasons.push(`LLM Judge escalated grey-zone activity (${judgeResult.reason})`);
    }
  }

  const isTainted = isAgentTainted(agent_id).tainted ? 1 : 0;
  let actionStatus = 'pending';
  let executionResult = null;

  // STEP 8 & 9: Persist Action & Branch Execution
  if (finalDecision === 'BLOCK') {
    actionStatus = 'blocked';
  } else if (finalDecision === 'ESCALATE') {
    actionStatus = 'pending';
    createApproval(actionId);
  } else {
    // ALLOW: Execute tool adapter immediately
    actionStatus = 'executed';
    try {
      executionResult = await executeAdapter(tool, args);

      // Scan read-type outputs for injected prompt poisoning
      if (tool.startsWith('crm.read_') || tool === 'email.read') {
        const outputScan = scanForInjection(executionResult);
        if (outputScan.detected) {
          taintAgent(
            agent_id,
            `Poisoned data payload encountered in ${tool}`,
            executionResult,
            actionId
          );
        }
      }
    } catch (adapterErr) {
      executionResult = { error: adapterErr.message, failed: true };
    }
  }

  // Persist into database
  db.prepare(`
    INSERT INTO actions (
      id, agent_id, task_context, tool, args_json, decision, status,
      risk_score, rule_ids, judge_json, result_json, tainted, created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actionId,
    agent_id,
    task_context,
    tool,
    JSON.stringify(args),
    finalDecision,
    actionStatus,
    riskInfo.score,
    JSON.stringify(policyResult.ruleIds || []),
    JSON.stringify(judgeResult),
    executionResult ? JSON.stringify(redactSensitiveData(executionResult)) : null,
    isTainted,
    now,
    now
  );

  // Append Audit Record
  let eventType = 'ACTION_EXECUTE';
  if (finalDecision === 'BLOCK') eventType = 'ACTION_BLOCKED';
  else if (finalDecision === 'ESCALATE') eventType = 'ACTION_ESCALATED';

  appendAuditEntry({
    agent_id,
    action_id: actionId,
    event_type: eventType,
    actor: `agent:${agent_id}`,
    payload: {
      tool,
      args,
      decision: finalDecision,
      status: actionStatus,
      risk_score: riskInfo.score,
      reasons: combinedReasons
    }
  });

  const fullAction = db.prepare('SELECT * FROM actions WHERE id = ?').get(actionId);

  // Broadcast live feed update
  broadcast('action', fullAction);

  // STEP 10: Feed into Anomaly Monitor
  recordAndCheckAnomaly({
    agent_id,
    tool,
    decision: finalDecision,
    action_id: actionId,
    args
  });

  return {
    status_code: 200,
    body: {
      action_id: actionId,
      decision: finalDecision,
      status: actionStatus,
      reason: combinedReasons.join('; ') || 'Permitted by security policy',
      risk_score: riskInfo.score,
      result: executionResult
    }
  };
}
