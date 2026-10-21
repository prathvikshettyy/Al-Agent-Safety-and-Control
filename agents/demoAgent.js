import http from 'http';

export class AgentClient {
  constructor({
    agentId = 'support-agent',
    agentKey = 'key_support_tier1_secret',
    gatewayUrl = 'http://127.0.0.1:3001'
  } = {}) {
    this.agentId = agentId;
    this.agentKey = agentKey;
    this.gatewayUrl = gatewayUrl;
  }

  /**
   * Executes a tool via the AgentGuard Gateway API.
   */
  async executeTool(tool, args = {}, taskContext = 'Autonomous agent execution') {
    const payload = {
      agent_id: this.agentId,
      task_context: taskContext,
      tool,
      args
    };

    const resp = await fetch(`${this.gatewayUrl}/v1/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': this.agentKey
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    return {
      statusCode: resp.status,
      data
    };
  }

  /**
   * Polls the gateway until an escalated approval is resolved or times out.
   */
  async pollAction(actionId, maxRetries = 10, intervalMs = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, intervalMs));
      const resp = await fetch(`${this.gatewayUrl}/v1/actions/${actionId}`, {
        headers: { 'X-Agent-Key': this.agentKey }
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.status !== 'pending') {
        return data;
      }
    }
    return { status: 'timed_out', action_id: actionId };
  }
}
