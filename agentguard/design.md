# AgentGuard: AI Agent Safety and Control Gateway

## 1. Problem

Autonomous AI agents call tools across business systems (CRM, email, DB, payments) with little human oversight. Agent can misbehave through bugs, hallucination, or prompt injection. Need system that **monitors, controls, blocks, and audits** agent actions.

## 2. Goals / Non-goals

**Goals**
- Intercept every agent tool call before it hits a business system.
- Decide ALLOW / BLOCK / ESCALATE in real time.
- Detect harmful or unauthorised actions (rules + optional LLM judge).
- Human-in-loop approval for risky actions.
- Tamper-evident audit log.
- Dashboard: live actions, alerts, approvals, kill switch.

**Non-goals (hackathon)**
- Multi-tenant auth, SSO, HA deployment.
- Real business system integrations (use mocks).
- Perfect injection detection.

## 3. Architecture

```
 Agent (LLM tool-use loop)
        |  execute(agent_id, tool, args)
        v
 +--------------------------- Gateway (FastAPI) ---------------------------+
 |  1. Auth + agent status check (paused? killed?)                          |
 |  2. Rate limit / action budget                                           |
 |  3. Policy engine (YAML rules)         -> ALLOW / BLOCK / ESCALATE      |
 |  4. Risk scorer (rules + LLM judge)    -> score 0-100                   |
 |  5. Decision combiner                                                    |
 |  6. Audit log (hash chain, SQLite)                                       |
 |  7. Anomaly monitor (sliding window) -> auto-pause                       |
 +-----------+----------------------------------+---------------------------+
             | ALLOW                            | ESCALATE
             v                                  v
     Tool adapters (mock CRM,          Approval queue (pending)
     Email, DB, Payments)                       |
                                                v
                                    Dashboard (React) <-- WebSocket feed
                                    approve / deny / pause / kill
```

Key principle: **agent never holds credentials or direct access**. Only gateway calls tool adapters. Bypass impossible by design.
