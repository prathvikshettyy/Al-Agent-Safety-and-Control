const TOKEN_STORAGE_KEY = 'agentguard_admin_token';

export function getAdminToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_TOKEN) || 'admin-secret-token-123';
}

export function setAdminToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request(path, options = {}) {
  const token = getAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('agentguard:unauthorized'));
    throw new Error('Unauthorized: Invalid or missing administrator token');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with HTTP status ${response.status}`);
  }

  return data;
}

export const api = {
  // Stats
  getStats: () => request('/api/stats'),

  // Actions
  getActions: (params = {}) => {
    const q = new URLSearchParams();
    if (params.agent) q.set('agent', params.agent);
    if (params.decision) q.set('decision', params.decision);
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', params.limit);
    return request(`/api/actions?${q.toString()}`);
  },
  getAction: (id) => request(`/api/actions/${id}`),

  // Approvals
  getApprovals: () => request('/api/approvals'),
  approve: (id, reviewer = 'admin', note = '') =>
    request(`/api/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reviewer, note })
    }),
  deny: (id, reviewer = 'admin', note = '') =>
    request(`/api/approvals/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify({ reviewer, note })
    }),

  // Agents
  getAgents: () => request('/api/agents'),
  pauseAgent: (id) => request(`/api/agents/${id}/pause`, { method: 'POST' }),
  resumeAgent: (id) => request(`/api/agents/${id}/resume`, { method: 'POST' }),
  killAgent: (id) => request(`/api/agents/${id}/kill`, { method: 'POST' }),

  // Alerts
  getAlerts: () => request('/api/alerts'),
  acknowledgeAlert: (id) => request(`/api/alerts/${id}/ack`, { method: 'POST' }),

  // Audit
  getAudit: (limit = 50, offset = 0) => request(`/api/audit?limit=${limit}&offset=${offset}`),
  verifyAudit: () => request('/api/audit/verify'),

  // Policies
  getPolicies: () => request('/api/policies'),
  updatePolicies: (policies) =>
    request('/api/policies', {
      method: 'PUT',
      body: JSON.stringify(policies)
    }),

  // Demo Runner
  runDemo: (scenario) =>
    request('/api/demo/run', {
      method: 'POST',
      body: JSON.stringify({ scenario })
    }),

  // Demo Reset
  resetDemo: () =>
    request('/api/demo/reset', {
      method: 'POST'
    }),

  // Health
  getHealth: () => request('/api/health')
};
