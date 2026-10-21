import { getDb } from '../db.js';

export async function read_customer({ customer_id }) {
  if (!customer_id) throw new Error('Missing customer_id parameter');
  const db = getDb();
  const customer = db.prepare('SELECT id, name, email, tier, balance, created_at FROM customers WHERE id = ?').get(customer_id);
  if (!customer) {
    throw new Error(`Customer with ID '${customer_id}' not found`);
  }
  return { customer };
}

export async function update_ticket({ ticket_id, status, notes }) {
  if (!ticket_id) throw new Error('Missing ticket_id parameter');
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket_id);
  if (!ticket) {
    throw new Error(`Ticket with ID '${ticket_id}' not found`);
  }

  const updatedNotes = notes ? `${ticket.description}\n[Update]: ${notes}` : ticket.description;
  const newStatus = status || ticket.status;

  db.prepare('UPDATE tickets SET status = ?, description = ? WHERE id = ?').run(newStatus, updatedNotes, ticket_id);

  return {
    ticket_id,
    status: newStatus,
    updated: true
  };
}

export async function list_customers({ limit = 10 } = {}) {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 500));
  const customers = db.prepare('SELECT id, name, email, tier, balance FROM customers LIMIT ?').all(safeLimit);
  return {
    count: customers.length,
    customers
  };
}

export async function read_ticket({ ticket_id }) {
  if (!ticket_id) throw new Error('Missing ticket_id parameter');
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket_id);
  if (!ticket) throw new Error(`Ticket with ID '${ticket_id}' not found`);
  return { ticket };
}
