import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy, evaluateCondition, getPolicies } from '../policy.js';

test('Policy Evaluator: condition expression syntax and operations', () => {
  assert.equal(evaluateCondition('args.amount > 1000', { args: { amount: 1500 } }), true);
  assert.equal(evaluateCondition('args.amount > 1000', { args: { amount: 500 } }), false);
  assert.equal(evaluateCondition("endsWith(args.to, '@company.com')", { args: { to: 'alice@company.com' } }), true);
  assert.equal(evaluateCondition("!endsWith(args.to, '@company.com')", { args: { to: 'eve@evil.com' } }), true);
  assert.equal(evaluateCondition("matches(args.sql, '(?i)(DROP|TRUNCATE|DELETE\\\\s+FROM)')", { args: { sql: 'DROP TABLE users' } }), true);
  assert.equal(evaluateCondition("matches(args.sql, '(?i)(DROP|TRUNCATE|DELETE\\\\s+FROM)')", { args: { sql: 'SELECT * FROM users' } }), false);
});

test('Policy: Tool not in agent allowlist is BLOCKED', () => {
  const result = evaluatePolicy('support-agent', 'db.query', { sql: 'SELECT 1' });
  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.ruleIds[0], 'TOOL_NOT_ALLOWED');
});

test('Policy: Unknown agent defaults to BLOCK (Fail Closed)', () => {
  const result = evaluatePolicy('unknown-rogue-agent', 'crm.read_customer', { customer_id: 'c_101' });
  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'BLOCK');
});

test('Policy: Refund 500 allows, 4500 escalates, 60000 blocks', () => {
  // 500 ALLOW
  const r500 = evaluatePolicy('support-agent', 'payments.refund', { amount: 500 });
  assert.equal(r500.allowed, true);
  assert.equal(r500.decision, 'ALLOW');

  // 4500 ESCALATE (threshold 1000)
  const r4500 = evaluatePolicy('support-agent', 'payments.refund', { amount: 4500 });
  assert.equal(r4500.allowed, false);
  assert.equal(r4500.decision, 'ESCALATE');
  assert.ok(r4500.ruleIds.includes('R2_refund_escalate'));

  // 60000 BLOCK (threshold 50000)
  const r60000 = evaluatePolicy('support-agent', 'payments.refund', { amount: 60000 });
  assert.equal(r60000.allowed, false);
  assert.equal(r60000.decision, 'BLOCK');
  assert.ok(r60000.ruleIds.includes('R1_refund_block'));
});

test('Policy: External email recipient is ESCALATED', () => {
  const ext = evaluatePolicy('support-agent', 'email.send', { to: 'external@partner.org', subject: 'Hi' });
  assert.equal(ext.decision, 'ESCALATE');
  assert.ok(ext.ruleIds.includes('R3_external_email'));

  const internal = evaluatePolicy('support-agent', 'email.send', { to: 'bob@company.com', subject: 'Hi' });
  assert.equal(internal.decision, 'ALLOW');
});

test('Policy: Destructive SQL is BLOCKED', () => {
  const drop = evaluatePolicy('ops-agent', 'db.query', { sql: 'DROP TABLE customers' });
  assert.equal(drop.decision, 'BLOCK');
  assert.ok(drop.ruleIds.includes('R5_destructive_sql'));

  const select = evaluatePolicy('ops-agent', 'db.query', { sql: 'SELECT * FROM sandbox_db' });
  assert.equal(select.decision, 'ALLOW');
});

test('Policy: Malformed rule expression fails closed to BLOCK', () => {
  assert.throws(() => evaluateCondition('args.amount &&&', { args: {} }));

  // Add a malformed rule to policy and ensure evaluatePolicy fails closed to BLOCK
  const policies = getPolicies();
  policies.agents['support-agent'].rules.push({
    id: 'R_MALFORMED',
    tool: 'crm.read_customer',
    when: 'args.invalid &&&',
    action: 'ALLOW'
  });

  const res = evaluatePolicy('support-agent', 'crm.read_customer', { customer_id: 'c_101' });
  assert.equal(res.decision, 'BLOCK');
  assert.equal(res.allowed, false);
  assert.ok(res.reasons.some(r => r.includes('Rule evaluation failed safely')));

  // Clean up
  policies.agents['support-agent'].rules.pop();
});
