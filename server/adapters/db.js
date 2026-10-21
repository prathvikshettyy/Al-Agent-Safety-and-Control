import { getDb } from '../db.js';

export async function query({ sql }) {
  if (!sql || typeof sql !== 'string') {
    throw new Error('Missing SQL query parameter');
  }

  const trimmed = sql.trim();
  // Safe sandbox execution guard
  const destructiveRegex = /^\s*(DROP|TRUNCATE|DELETE\s+FROM)\b/i;
  if (destructiveRegex.test(trimmed)) {
    throw new Error(`Execution of destructive SQL disallowed in sandbox: "${trimmed}"`);
  }

  const db = getDb();

  // If SELECT query, return rows
  if (/^\s*SELECT\b/i.test(trimmed)) {
    const rows = db.prepare(trimmed).all();
    return { rows, count: rows.length };
  }

  // Otherwise run execution
  const result = db.prepare(trimmed).run();
  return {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid
  };
}
