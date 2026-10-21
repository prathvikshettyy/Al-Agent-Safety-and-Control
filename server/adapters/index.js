import * as crm from './crm.js';
import * as payments from './payments.js';
import * as email from './email.js';
import * as db from './db.js';

const ADAPTER_REGISTRY = {
  'crm.read_customer': crm.read_customer,
  'crm.update_ticket': crm.update_ticket,
  'crm.list_customers': crm.list_customers,
  'crm.read_ticket': crm.read_ticket,
  'payments.refund': payments.refund,
  'payments.query_ledger': payments.query_ledger,
  'email.send': email.send,
  'db.query': db.query
};

export const SENSITIVE_TOOLS = new Set([
  'payments.refund',
  'email.send',
  'db.query'
]);

/**
 * Mask credit cards and tokens from JSON objects or strings before logging/auditing.
 */
export function redactSensitiveData(data) {
  if (data == null) return data;

  if (typeof data === 'string') {
    // Redact credit cards (13-19 digits, possibly with dashes or spaces)
    let cleaned = data.replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, '****-****-****-****');
    // Redact Bearer / API keys
    cleaned = cleaned.replace(/(?:key|token|secret|password)["']?\s*[:=]\s*["']?([a-zA-Z0-9_\-]{8,})["']?/gi, '$1=[REDACTED]');
    return cleaned;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }

  if (typeof data === 'object') {
    const copy = {};
    for (const [key, val] of Object.entries(data)) {
      if (/card|cvv|token|secret|password|api_key/i.test(key)) {
        copy[key] = '[REDACTED]';
      } else {
        copy[key] = redactSensitiveData(val);
      }
    }
    return copy;
  }

  return data;
}

export async function executeAdapter(tool, args = {}) {
  const handler = ADAPTER_REGISTRY[tool];
  if (!handler) {
    throw new Error(`Unknown tool adapter: '${tool}'`);
  }
  return await handler(args);
}
