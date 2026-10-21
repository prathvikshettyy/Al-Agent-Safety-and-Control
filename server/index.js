import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';
import { executeGatewayAction } from './gateway.js';
import { approveAction, denyAction, initApprovalsWorker } from './approvals.js';
import { getPolicies, updatePolicies } from './policy.js';
import { verifyAuditChain, appendAuditEntry } from './audit.js';
import { initWebSocketServer, broadcast } from './broadcast.js';
import { runScenario } from '../agents/scenarios.js';
import { resetDemoState } from './seed.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token-123';

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initWebSocketServer(server);

// Initialize background approvals auto-expiry worker
initApprovalsWorker();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ----------------------------------------------------
// Authentication Middlewares
// ----------------------------------------------------
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || parts[1] !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Invalid admin authentication token' });
  }

  next();
}

// ----------------------------------------------------
// Agent-Facing Endpoints
// ----------------------------------------------------

// POST /v1/execute
app.post('/v1/execute', async (req, res) => {
  try {
    const raw_agent_key = req.headers['x-agent-key'] || req.body.agent_key;
    const { agent_id, task_context, tool, args, idempotency_key } = req.body;

    const result = await executeGatewayAction({
      agent_id,
      task_context,
      tool,
      args,
      idempotency_key,
      raw_agent_key
    });

    return res.status(result.status_code).json(result.body);
  } catch (err) {
    console.error('Unhandled error in /v1/execute:', err);
    // Strict fail-closed guarantee
    return res.status(500).json({
      decision: 'BLOCK',
      status: 'error',
      reason: `Internal Gateway exception: ${err.message}`
    });
  }
});

// GET /v1/actions/:id (Polling for async approvals)
app.get('/v1/actions/:id', (req, res) => {
  const db = getDb();
  const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(req.params.id);

  if (!action) {
    return res.status(404).json({ error: `Action '${req.params.id}' not found` });
  }

  let result = null;
  try {
    result = action.result_json ? JSON.parse(action.result_json) : null;
  } catch {}

  res.json({
    id: action.id,
    agent_id: action.agent_id,
    tool: action.tool,
    decision: action.decision,
    status: action.status,
    risk_score: action.risk_score,
    result,
    created_at: action.created_at,
    decided_at: action.decided_at
  });
});

// ----------------------------------------------------
// Admin-Facing REST API
// ----------------------------------------------------

// GET /api/stats
app.get('/api/stats', requireAdminAuth, (req, res) => {
  const db = getDb();

  const totalActions = db.prepare('SELECT COUNT(*) as count FROM actions').get().count;
  const blockedActions = db.prepare("SELECT COUNT(*) as count FROM actions WHERE decision = 'BLOCK'").get().count;
  const escalatedActions = db.prepare("SELECT COUNT(*) as count FROM actions WHERE decision = 'ESCALATE'").get().count;
  const allowedActions = db.prepare("SELECT COUNT(*) as count FROM actions WHERE decision = 'ALLOW'").get().count;

  const pendingApprovals = db.prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'").get().count;
  const activeAlerts = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0').get().count;

  const agentsCount = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active,
      COUNT(CASE WHEN status = 'PAUSED' THEN 1 END) as paused,
      COUNT(CASE WHEN status = 'KILLED' THEN 1 END) as killed,
      COUNT(*) as total
    FROM agents
  `).get();

  // Actions per minute timeline (last 30 minutes)
  const timeline = db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:%M:00', created_at) as minute,
      COUNT(*) as total,
      COUNT(CASE WHEN decision = 'ALLOW' THEN 1 END) as allowed,
      COUNT(CASE WHEN decision = 'BLOCK' THEN 1 END) as blocked,
      COUNT(CASE WHEN decision = 'ESCALATE' THEN 1 END) as escalated
    FROM actions
    GROUP BY minute
    ORDER BY minute DESC
    LIMIT 30
  `).all().reverse();

  const blockRate = totalActions > 0 ? ((blockedActions / totalActions) * 100).toFixed(1) : '0.0';

  res.json({
    totalActions,
    blockedActions,
    escalatedActions,
    allowedActions,
    blockRate: Number(blockRate),
    pendingApprovals,
    activeAlerts,
    agents: agentsCount,
    timeline
  });
});

// GET /api/actions
app.get('/api/actions', requireAdminAuth, (req, res) => {
  const db = getDb();
  const { agent, decision, since, limit = 50, search } = req.query;

  let query = 'SELECT * FROM actions WHERE 1=1';
  const params = [];

  if (agent) {
    query += ' AND agent_id = ?';
    params.push(agent);
  }

  if (decision) {
    query += ' AND decision = ?';
    params.push(decision);
  }

  if (since) {
    query += ' AND created_at >= ?';
    params.push(since);
  }

  if (search) {
    query += ' AND (id LIKE ? OR tool LIKE ? OR task_context LIKE ? OR args_json LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 50, 200));

  const actions = db.prepare(query).all(...params);

  // Attach approval and audit info
  const enriched = actions.map((act) => {
    let args = {};
    let rule_ids = [];
    let judge = null;
    let result = null;

    try { args = JSON.parse(act.args_json); } catch {}
    try { rule_ids = JSON.parse(act.rule_ids); } catch {}
    try { judge = JSON.parse(act.judge_json); } catch {}
    try { result = JSON.parse(act.result_json); } catch {}

    const approval = db.prepare('SELECT * FROM approvals WHERE action_id = ?').get(act.id);
    const auditRow = db.prepare('SELECT seq, hash FROM audit_log WHERE action_id = ? ORDER BY seq DESC LIMIT 1').get(act.id);

    return {
      ...act,
      args,
      rule_ids,
      judge,
      result,
      approval,
      audit_hash: auditRow ? auditRow.hash : null,
      audit_seq: auditRow ? auditRow.seq : null
    };
  });

  res.json({ actions: enriched });
});

// GET /api/actions/:id
app.get('/api/actions/:id', requireAdminAuth, (req, res) => {
  const db = getDb();
  const act = db.prepare('SELECT * FROM actions WHERE id = ?').get(req.params.id);

  if (!act) return res.status(404).json({ error: 'Action not found' });

  let args = {};
  let rule_ids = [];
  let judge = null;
  let result = null;

  try { args = JSON.parse(act.args_json); } catch {}
  try { rule_ids = JSON.parse(act.rule_ids); } catch {}
  try { judge = JSON.parse(act.judge_json); } catch {}
  try { result = JSON.parse(act.result_json); } catch {}

  const approval = db.prepare('SELECT * FROM approvals WHERE action_id = ?').get(act.id);
  const auditEntries = db.prepare('SELECT * FROM audit_log WHERE action_id = ? ORDER BY seq ASC').all(act.id);

  res.json({
    ...act,
    args,
    rule_ids,
    judge,
    result,
    approval,
    audit_entries: auditEntries
  });
});

// GET /api/approvals
app.get('/api/approvals', requireAdminAuth, (req, res) => {
  const db = getDb();
  const approvals = db.prepare(`
    SELECT a.*, act.agent_id, act.tool, act.task_context, act.args_json, act.risk_score, act.rule_ids
    FROM approvals a
    JOIN actions act ON a.action_id = act.id
    ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC
  `).all();

  const enriched = approvals.map(appr => {
    let args = {};
    let rule_ids = [];
    try { args = JSON.parse(appr.args_json); } catch {}
    try { rule_ids = JSON.parse(appr.rule_ids); } catch {}
    return { ...appr, args, rule_ids };
  });

  res.json({ approvals: enriched });
});

// POST /api/approvals/:id/approve
app.post('/api/approvals/:id/approve', requireAdminAuth, async (req, res) => {
  try {
    const { reviewer = 'admin', note = '' } = req.body;
    const result = await approveAction(req.params.id, reviewer, note);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/approvals/:id/deny
app.post('/api/approvals/:id/deny', requireAdminAuth, async (req, res) => {
  try {
    const { reviewer = 'admin', note = '' } = req.body;
    const result = await denyAction(req.params.id, reviewer, note);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/agents
app.get('/api/agents', requireAdminAuth, (req, res) => {
  const db = getDb();
  const agents = db.prepare('SELECT id, role, status, created_at FROM agents').all();

  const enriched = agents.map(agent => {
    const lastAction = db.prepare('SELECT * FROM actions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1').get(agent.id);
    const lastHourCount = db.prepare(`
      SELECT COUNT(*) as count FROM actions
      WHERE agent_id = ? AND created_at >= datetime('now', '-1 hour')
    `).get(agent.id).count;

    return {
      ...agent,
      last_action: lastAction || null,
      actions_last_hour: lastHourCount
    };
  });

  res.json({ agents: enriched });
});

// POST /api/agents/:id/pause
app.post('/api/agents/:id/pause', requireAdminAuth, (req, res) => {
  const db = getDb();
  const agentId = req.params.id;
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);

  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.status === 'KILLED') return res.status(400).json({ error: 'Cannot modify a permanently KILLED agent' });

  db.prepare("UPDATE agents SET status = 'PAUSED' WHERE id = ?").run(agentId);

  appendAuditEntry({
    agent_id: agentId,
    event_type: 'AGENT_PAUSED',
    actor: 'human:admin',
    payload: { manual: true }
  });

  broadcast('agent', { id: agentId, status: 'PAUSED' });
  res.json({ id: agentId, status: 'PAUSED' });
});

// POST /api/agents/:id/resume
app.post('/api/agents/:id/resume', requireAdminAuth, (req, res) => {
  const db = getDb();
  const agentId = req.params.id;
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);

  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.status === 'KILLED') return res.status(400).json({ error: 'Cannot resume a permanently KILLED agent' });

  db.prepare("UPDATE agents SET status = 'ACTIVE' WHERE id = ?").run(agentId);

  appendAuditEntry({
    agent_id: agentId,
    event_type: 'AGENT_RESUMED',
    actor: 'human:admin',
    payload: { manual: true }
  });

  broadcast('agent', { id: agentId, status: 'ACTIVE' });
  res.json({ id: agentId, status: 'ACTIVE' });
});

// POST /api/agents/:id/kill
app.post('/api/agents/:id/kill', requireAdminAuth, (req, res) => {
  const db = getDb();
  const agentId = req.params.id;
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  // Invalidate API key and mark KILLED
  const deadHash = crypto.createHash('sha256').update(`REVOKED_${Date.now()}`).digest('hex');
  db.prepare("UPDATE agents SET status = 'KILLED', api_key_hash = ? WHERE id = ?").run(deadHash, agentId);

  appendAuditEntry({
    agent_id: agentId,
    event_type: 'AGENT_KILLED',
    actor: 'human:admin',
    payload: { reason: 'Emergency Kill-Switch triggered by administrator' }
  });

  broadcast('agent', { id: agentId, status: 'KILLED' });
  res.json({ id: agentId, status: 'KILLED' });
});

// GET /api/alerts
app.get('/api/alerts', requireAdminAuth, (req, res) => {
  const db = getDb();
  const alerts = db.prepare(`
    SELECT * FROM alerts
    ORDER BY CASE severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      ELSE 4 END,
      created_at DESC
    LIMIT 100
  `).all();

  res.json({ alerts });
});

// POST /api/alerts/:id/ack
app.post('/api/alerts/:id/ack', requireAdminAuth, (req, res) => {
  const db = getDb();
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);

  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(req.params.id);
  const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);

  broadcast('alert', updated);
  res.json(updated);
});

// GET /api/audit
app.get('/api/audit', requireAdminAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT ? OFFSET ?').all(limit, offset);

  const enriched = rows.map(r => {
    let payload = {};
    try { payload = JSON.parse(r.payload_json); } catch {}
    return { ...r, payload };
  });

  res.json({
    total,
    limit,
    offset,
    entries: enriched
  });
});

// GET /api/audit/verify
app.get('/api/audit/verify', requireAdminAuth, (req, res) => {
  const result = verifyAuditChain();
  res.json(result);
});

// GET /api/policies
app.get('/api/policies', requireAdminAuth, (req, res) => {
  const policies = getPolicies();
  res.json({ policies });
});

// PUT /api/policies
app.put('/api/policies', requireAdminAuth, (req, res) => {
  try {
    const updated = updatePolicies(req.body);

    appendAuditEntry({
      event_type: 'POLICY_RELOADED',
      actor: 'human:admin',
      payload: {
        version: updated.version,
        default: updated.default,
        timestamp: new Date().toISOString()
      }
    });

    broadcast('stats', { message: 'Policies updated and hot-reloaded' });
    res.json({ success: true, policies: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/demo/run (Triggered from presentation panel in UI)
app.post('/api/demo/run', requireAdminAuth, async (req, res) => {
  const { scenario = 'normal' } = req.body;
  try {
    const result = await runScenario(scenario);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/demo/reset (Re-seed DB, clear alerts/actions, revive agents, fresh ledger)
app.post('/api/demo/reset', requireAdminAuth, (req, res) => {
  try {
    const result = resetDemoState();
    broadcast('stats', { message: 'Demo reset completed' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health
app.get('/api/health', (req, res) => {
  try {
    const db = getDb();
    const agents = db.prepare('SELECT COUNT(*) as count FROM agents').get().count;
    res.json({
      status: 'healthy',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected',
      agents
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});

// Serve frontend production build if present
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/v1')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(200).send('AgentGuard Gateway API Server is running.');
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`========================================================`);
    console.log(`  AgentGuard Gateway Backend is active on port ${PORT}`);
    console.log(`  WebSocket live feed ready at: ws://localhost:${PORT}/ws/feed`);
    console.log(`========================================================`);
  });
}

export { app, server };
