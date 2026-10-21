import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_POLICY_PATH = path.resolve(__dirname, 'policies', 'default.json');

let activePolicy = null;
let activePolicyPath = DEFAULT_POLICY_PATH;

/**
 * Tokenizer for safe policy expressions.
 */
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const ch = expr[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Two-character operators
    if (i + 1 < n) {
      const two = expr.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
        tokens.push({ type: 'OP', value: two });
        i += 2;
        continue;
      }
    }

    // Single-character operators & syntax
    if (['<', '>', '!', '(', ')', ',', '+', '-', '*', '/'].includes(ch)) {
      tokens.push({ type: ch === '(' || ch === ')' || ch === ',' ? 'PUNCT' : 'OP', value: ch });
      i++;
      continue;
    }

    // String literals (single or double quotes)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      i++;
      while (i < n && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < n) {
          str += expr[i + 1];
          i += 2;
        } else {
          str += expr[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Number literals
    if (/[0-9]/.test(ch)) {
      let numStr = '';
      while (i < n && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
      continue;
    }

    // Identifiers and member access (e.g. args.amount, matches, true, false, null)
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < n && /[a-zA-Z0-9_.]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      if (ident === 'true') {
        tokens.push({ type: 'BOOLEAN', value: true });
      } else if (ident === 'false') {
        tokens.push({ type: 'BOOLEAN', value: false });
      } else if (ident === 'null') {
        tokens.push({ type: 'NULL', value: null });
      } else {
        tokens.push({ type: 'IDENT', value: ident });
      }
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at index ${i} in expression: ${expr}`);
  }

  return tokens;
}

/**
 * Safe Recursive Descent Parser & Evaluator
 */
class SafeEvaluator {
  constructor(tokens, context) {
    this.tokens = tokens;
    this.context = context;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos] || null;
  }

  consume() {
    return this.tokens[this.pos++];
  }

  expect(val) {
    const t = this.consume();
    if (!t || t.value !== val) {
      throw new Error(`Expected '${val}', got '${t ? t.value : 'EOF'}'`);
    }
    return t;
  }

  evaluate() {
    const result = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token '${this.tokens[this.pos].value}' after valid expression`);
    }
    return result;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.peek() && this.peek().value === '||') {
      this.consume();
      const right = this.parseAnd();
      left = Boolean(left || right);
    }
    return left;
  }

  parseAnd() {
    let left = this.parseEquality();
    while (this.peek() && this.peek().value === '&&') {
      this.consume();
      const right = this.parseEquality();
      left = Boolean(left && right);
    }
    return left;
  }

  parseEquality() {
    let left = this.parseRelational();
    while (this.peek() && ['==', '!='].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseRelational();
      if (op === '==') left = left == right;
      else if (op === '!=') left = left != right;
    }
    return left;
  }

  parseRelational() {
    let left = this.parseAdditive();
    while (this.peek() && ['<', '>', '<=', '>='].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseAdditive();
      if (op === '<') left = left < right;
      else if (op === '>') left = left > right;
      else if (op === '<=') left = left <= right;
      else if (op === '>=') left = left >= right;
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek() && ['+', '-'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseMultiplicative();
      if (op === '+') left = left + right;
      else if (op === '-') left = left - right;
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.peek() && ['*', '/'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseUnary();
      if (op === '*') left = left * right;
      else if (op === '/') left = left / right;
    }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (t && t.value === '!') {
      this.consume();
      return !this.parseUnary();
    }
    if (t && t.value === '-') {
      this.consume();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of expression');

    if (t.type === 'NUMBER' || t.type === 'STRING' || t.type === 'BOOLEAN') {
      return this.consume().value;
    }

    if (t.type === 'NULL') {
      this.consume();
      return null;
    }

    if (t.value === '(') {
      this.consume();
      const val = this.parseOr();
      this.expect(')');
      return val;
    }

    if (t.type === 'IDENT') {
      const ident = this.consume().value;

      // Check if function call
      if (this.peek() && this.peek().value === '(') {
        this.consume();
        const args = [];
        if (this.peek() && this.peek().value !== ')') {
          args.push(this.parseOr());
          while (this.peek() && this.peek().value === ',') {
            this.consume();
            args.push(this.parseOr());
          }
        }
        this.expect(')');
        return this.callFunction(ident, args);
      }

      // Variable / property lookup
      return this.resolveIdentifier(ident);
    }

    throw new Error(`Unexpected token '${t.value}' in primary expression`);
  }

  resolveIdentifier(ident) {
    const parts = ident.split('.');
    let current = this.context;

    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }

  callFunction(fnName, args) {
    switch (fnName) {
      case 'len': {
        const val = args[0];
        if (val == null) return 0;
        if (typeof val === 'string' || Array.isArray(val)) return val.length;
        if (typeof val === 'object') return Object.keys(val).length;
        return 0;
      }
      case 'matches': {
        const [target, pattern] = args;
        if (typeof target !== 'string' || typeof pattern !== 'string') return false;
        try {
          // Check for flags prefix like (?i)
          let flags = '';
          let cleanPattern = pattern;
          if (pattern.startsWith('(?i)')) {
            flags = 'i';
            cleanPattern = pattern.slice(4);
          }
          const regex = new RegExp(cleanPattern, flags);
          return regex.test(target);
        } catch {
          return false;
        }
      }
      case 'endsWith': {
        const [target, suffix] = args;
        if (typeof target !== 'string' || typeof suffix !== 'string') return false;
        return target.endsWith(suffix);
      }
      case 'startsWith': {
        const [target, prefix] = args;
        if (typeof target !== 'string' || typeof prefix !== 'string') return false;
        return target.startsWith(prefix);
      }
      case 'includes': {
        const [target, search] = args;
        if (typeof target === 'string') return target.includes(String(search));
        if (Array.isArray(target)) return target.includes(search);
        return false;
      }
      default:
        throw new Error(`Unauthorized or unknown function '${fnName}' in policy expression`);
    }
  }
}

/**
 * Safely evaluates a boolean condition string against a context object.
 */
export function evaluateCondition(expr, context) {
  if (!expr || typeof expr !== 'string' || expr.trim() === '') {
    return false;
  }
  const tokens = tokenize(expr.trim());
  const evaluator = new SafeEvaluator(tokens, context);
  return Boolean(evaluator.evaluate());
}

/**
 * Loads policy from disk or returns active cached policy.
 */
export function loadPolicies(filePath = DEFAULT_POLICY_PATH) {
  activePolicyPath = filePath;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    activePolicy = JSON.parse(raw);
    return activePolicy;
  } catch (err) {
    console.error(`Failed to load policy from ${filePath}:`, err);
    if (!activePolicy) {
      // Fallback safe policy: deny all
      activePolicy = {
        version: '1.0.0-fallback',
        default: 'BLOCK',
        agents: {}
      };
    }
    return activePolicy;
  }
}

export function getPolicies() {
  if (!activePolicy) {
    loadPolicies();
  }
  return activePolicy;
}

/**
 * Validates and hot-reloads a new policy specification.
 */
export function updatePolicies(newPolicy) {
  if (!newPolicy || typeof newPolicy !== 'object') {
    throw new Error('Policy must be a valid JSON object');
  }

  if (!newPolicy.default || !['BLOCK', 'ESCALATE', 'ALLOW'].includes(newPolicy.default)) {
    throw new Error('Policy must define a valid default action (BLOCK, ESCALATE, ALLOW)');
  }

  if (!newPolicy.agents || typeof newPolicy.agents !== 'object') {
    throw new Error('Policy must contain an "agents" map');
  }

  // Validate rules and syntax across all agents
  for (const [agentId, agentConfig] of Object.entries(newPolicy.agents)) {
    if (!Array.isArray(agentConfig.allowed_tools)) {
      throw new Error(`Agent '${agentId}' must specify allowed_tools array`);
    }

    if (Array.isArray(agentConfig.rules)) {
      for (const rule of agentConfig.rules) {
        if (!rule.id || !rule.tool || !rule.when || !rule.action) {
          throw new Error(`Rule in agent '${agentId}' missing required fields (id, tool, when, action)`);
        }
        // Test compile expression syntax
        try {
          tokenize(rule.when);
        } catch (e) {
          throw new Error(`Syntax error in rule '${rule.id}' for agent '${agentId}': ${e.message}`);
        }
      }
    }
  }

  // Persist to disk and update active policy
  fs.writeFileSync(activePolicyPath, JSON.stringify(newPolicy, null, 2), 'utf-8');
  activePolicy = newPolicy;
  return activePolicy;
}

/**
 * Evaluates whether an agent's tool execution satisfies policy rules.
 */
export function evaluatePolicy(agentId, tool, args = {}) {
  const policies = getPolicies();
  const agentPolicy = policies.agents?.[agentId];

  // Unknown agent or no policy -> Deny by default
  if (!agentPolicy) {
    return {
      allowed: false,
      decision: 'BLOCK',
      ruleIds: ['DEFAULT_UNKNOWN_AGENT'],
      reasons: [`No active safety policy registered for agent '${agentId}'`]
    };
  }

  // Tool not in allowlist -> BLOCK
  if (!agentPolicy.allowed_tools.includes(tool)) {
    return {
      allowed: false,
      decision: 'BLOCK',
      ruleIds: ['TOOL_NOT_ALLOWED'],
      reasons: [`Tool '${tool}' is not permitted for agent '${agentId}'. Allowed: [${agentPolicy.allowed_tools.join(', ')}]`]
    };
  }

  const matchedRules = [];
  const reasons = [];
  let highestDecision = 'ALLOW';

  // Evaluate deterministic rules in order
  const rules = agentPolicy.rules || [];
  for (const rule of rules) {
    if (rule.tool === '*' || rule.tool === tool) {
      try {
        const matches = evaluateCondition(rule.when, { args, tool, agentId });
        if (matches) {
          matchedRules.push(rule.id);
          reasons.push(rule.message || `Matched rule ${rule.id}`);

          if (rule.action === 'BLOCK') {
            highestDecision = 'BLOCK';
          } else if (rule.action === 'ESCALATE' && highestDecision !== 'BLOCK') {
            highestDecision = 'ESCALATE';
          }
        }
      } catch (err) {
        // Fail-closed: any evaluation exception on a rule defaults to BLOCK
        console.error(`Error evaluating rule ${rule.id}:`, err);
        matchedRules.push(rule.id);
        reasons.push(`Rule evaluation failed safely: ${err.message}`);
        highestDecision = 'BLOCK';
      }
    }
  }

  return {
    allowed: highestDecision === 'ALLOW',
    decision: highestDecision,
    ruleIds: matchedRules,
    reasons
  };
}
