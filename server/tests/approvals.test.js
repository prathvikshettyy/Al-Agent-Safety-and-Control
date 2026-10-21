import test from 'node:test';
import assert from 'node:assert/strict';
import { executeGatewayAction } from '../gateway.js';
import { approveAction, denyAction } from '../approvals.js';
import { getDb } from '../db.js';

test('Approvals: Approve executes adapter once and is idempotent', async () => {
  const db = getDb();

  // Escalate a 4500 refund
  const gateRes = await executeGatewayAction({
    agent_id: 'finance-agent',
    tool: 'payments.refund',
    args: { customer_id: 'c_101', amount: 4500, reason: 'Approved refund test' },
    raw_agent_key: 'key_finance_controller_secret'
  });

  assert.equal(gateRes.body.decision, 'ESCALATE');
  const actionId = gateRes.body.action_id;

  const approval = db.prepare('SELECT * FROM approvals WHERE action_id = ?').get(actionId);
  assert.ok(approval);
  assert.equal(approval.status, 'pending');

  const customerBefore = db.prepare('SELECT balance FROM customers WHERE id = ?').get('c_101');

  // First approval execution
  const res1 = await approveAction(approval.id, 'security_lead', 'Authorized under policy exception');
  assert.equal(res1.status, 'approved');
  assert.ok(res1.result);
  assert.equal(res1.result.status, 'COMPLETED');

  const customerAfterFirst = db.prepare('SELECT balance FROM customers WHERE id = ?').get('c_101');
  assert.equal(customerAfterFirst.balance, customerBefore.balance + 4500);

  // Second approval call (simulating double click)
  const res2 = await approveAction(approval.id, 'security_lead', 'Double click');
  assert.equal(res2.status, 'approved');

  // Balance should not have increased again!
  const customerAfterSecond = db.prepare('SELECT balance FROM customers WHERE id = ?').get('c_101');
  assert.equal(customerAfterSecond.balance, customerAfterFirst.balance);
});

test('Approvals: Deny never executes adapter', async () => {
  const db = getDb();

  const gateRes = await executeGatewayAction({
    agent_id: 'finance-agent',
    tool: 'payments.refund',
    args: { customer_id: 'c_102', amount: 2000, reason: 'Denied test' },
    raw_agent_key: 'key_finance_controller_secret'
  });

  const approval = db.prepare('SELECT * FROM approvals WHERE action_id = ?').get(gateRes.body.action_id);
  const customerBefore = db.prepare('SELECT balance FROM customers WHERE id = ?').get('c_102');

  const denyRes = await denyAction(approval.id, 'auditor', 'Suspected fraud');
  assert.equal(denyRes.status, 'denied');

  // Balance must remain unchanged
  const customerAfter = db.prepare('SELECT balance FROM customers WHERE id = ?').get('c_102');
  assert.equal(customerAfter.balance, customerBefore.balance);
});

test('Approvals: Expired approval rejects execution', async () => {
  const db = getDb();

  const gateRes = await executeGatewayAction({
    agent_id: 'finance-agent',
    tool: 'payments.refund',
    args: { customer_id: 'c_102', amount: 1500, reason: 'Expiry test' },
    raw_agent_key: 'key_finance_controller_secret'
  });

  const approval = db.prepare('SELECT * FROM approvals WHERE action_id = ?').get(gateRes.body.action_id);

  // Manually mark expired
  db.prepare("UPDATE approvals SET status = 'expired' WHERE id = ?").run(approval.id);

  const res = await approveAction(approval.id, 'admin', 'Late approve attempt');
  assert.equal(res.status, 'expired');
  assert.ok(res.message.includes('expired'));
});
