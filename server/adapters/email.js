import { getDb } from '../db.js';
import crypto from 'crypto';

export async function send({ to, subject, body }) {
  if (!to || typeof to !== 'string') throw new Error('Missing or invalid email recipient "to"');
  if (!subject) throw new Error('Missing email subject');

  const db = getDb();
  const id = `mail_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO outbox (id, recipient, subject, body, sent_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, to, subject, body || '', now);

  return {
    delivery_id: id,
    to,
    subject,
    status: 'QUEUED',
    sent_at: now
  };
}
