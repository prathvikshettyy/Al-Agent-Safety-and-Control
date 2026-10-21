import { isAgentTainted } from './injection.js';
import { SENSITIVE_TOOLS } from './adapters/index.js';

export function calculateRiskScore({ agent_id, tool, args = {}, task_context = '', burstFactor = 0 }) {
  let score = 0;
  const reasons = [];

  // 1. Tool sensitivity
  if (SENSITIVE_TOOLS.has(tool)) {
    if (tool === 'payments.refund') {
      score += 20;
      reasons.push('Financial disbursement tool (payments.refund) invoked (+20)');
    } else if (tool === 'email.send') {
      score += 15;
      reasons.push('External communications tool (email.send) invoked (+15)');
    } else if (tool === 'db.query') {
      score += 25;
      reasons.push('Direct database execution tool (db.query) invoked (+25)');
    }
  }

  // 2. Financial threshold escalation
  if (tool === 'payments.refund' && args.amount != null) {
    const amount = Number(args.amount) || 0;
    if (amount > 50000) {
      score += 50;
      reasons.push(`Critical transaction: Refund amount (${amount}) exceeds hard cap of 50,000 (+50)`);
    } else if (amount > 10000) {
      score += 35;
      reasons.push(`High transaction: Refund amount (${amount}) exceeds 10,000 (+35)`);
    } else if (amount > 1000) {
      score += 20;
      reasons.push(`Moderate transaction: Refund amount (${amount}) exceeds auto-approval threshold 1,000 (+20)`);
    }
  }

  // 3. External communications exfiltration risk
  if (tool === 'email.send' && args.to) {
    const to = String(args.to);
    if (!to.endsWith('@company.com')) {
      score += 30;
      reasons.push(`Untrusted destination: Email recipient '${to}' is outside organization domain (+30)`);
    }
  }

  // 4. Destructive SQL detection
  if (tool === 'db.query' && args.sql) {
    const sql = String(args.sql);
    if (/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)) {
      score += 60;
      reasons.push('Destructive database mutation operation detected in SQL (+60)');
    }
  }

  // 5. Bulk data export
  if (tool === 'crm.list_customers' && args.limit != null) {
    const limit = Number(args.limit) || 0;
    if (limit > 100) {
      score += 30;
      reasons.push(`Bulk data extraction: Requesting ${limit} records (+30)`);
    }
  }

  // 6. Prompt injection / taint check
  const taintStatus = isAgentTainted(agent_id);
  if (taintStatus.tainted) {
    score += 30;
    reasons.push(`Tainted session: Agent previously exposed to prompt injection (${taintStatus.reason}) (+30)`);
  }

  // 7. Anomaly / burst activity factor
  if (burstFactor > 0) {
    score += burstFactor;
    reasons.push(`Velocity anomaly: Unusually rapid execution burst (+${burstFactor})`);
  }

  // Ensure score is clamped between 0 and 100
  const finalScore = Math.min(100, Math.max(0, score));

  return {
    score: finalScore,
    reasons
  };
}
