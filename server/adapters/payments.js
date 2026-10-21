import { getDb } from '../db.js';
import crypto from 'crypto';

export async function refund({ customer_id, amount, reason = 'Customer requested refund' }) {
  if (!customer_id) throw new Error('Missing customer_id parameter');
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Invalid refund amount: must be a positive number');
  }

  const db = getDb();

  // Execute inside a transaction
  const executeRefund = db.transaction(() => {
    const customer = db.prepare('SELECT id, balance FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      throw new Error(`Customer with ID '${customer_id}' not found`);
    }

    const newBalance = customer.balance + numAmount;
    db.prepare('UPDATE customers SET balance = ? WHERE id = ?').run(newBalance, customer_id);

    const ledgerId = `tx_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO payments_ledger (id, customer_id, amount, currency, type, status, timestamp)
      VALUES (?, ?, ?, 'INR', 'REFUND', 'COMPLETED', ?)
    `).run(ledgerId, customer_id, numAmount, now);

    return {
      transaction_id: ledgerId,
      customer_id,
      refunded_amount: numAmount,
      currency: 'INR',
      new_balance: newBalance,
      reason,
      status: 'COMPLETED'
    };
  });

  return executeRefund();
}

export async function query_ledger({ customer_id, limit = 10 } = {}) {
  const db = getDb();
  let records;
  if (customer_id) {
    records = db.prepare('SELECT * FROM payments_ledger WHERE customer_id = ? ORDER BY timestamp DESC LIMIT ?').all(customer_id, limit);
  } else {
    records = db.prepare('SELECT * FROM payments_ledger ORDER BY timestamp DESC LIMIT ?').all(limit);
  }
  return { count: records.length, records };
}
