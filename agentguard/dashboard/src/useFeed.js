import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = "http://127.0.0.1:8000";
const WS_URL = "ws://127.0.0.1:8000/ws/feed";

export function useFeed() {
  const [actions, setActions] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState({
    total_actions: 0,
    blocked_actions: 0,
    escalated_actions: 0,
    allowed_actions: 0,
    block_rate_pct: 0,
    pending_approvals: 0,
    active_alerts: 0,
    total_agents: 0,
    active_agents: 0,
  });
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const wsRef = useRef(null);

  const addToast = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-4), { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      const [actRes, appRes, altRes, agRes, statRes] = await Promise.all([
        fetch(`${API_BASE}/api/actions?limit=50`).then((r) => r.json()),
        fetch(`${API_BASE}/api/approvals`).then((r) => r.json()),
        fetch(`${API_BASE}/api/alerts`).then((r) => r.json()),
        fetch(`${API_BASE}/api/agents`).then((r) => r.json()),
        fetch(`${API_BASE}/api/stats`).then((r) => r.json()),
      ]);

      if (actRes.actions) setActions(actRes.actions);
      if (appRes.approvals) setApprovals(appRes.approvals);
      if (altRes.alerts) setAlerts(altRes.alerts);
      if (agRes.agents) setAgents(agRes.agents);
      if (statRes) setStats(statRes);
    } catch (err) {
      console.warn("Failed fetching initial data:", err);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // WebSocket with auto-reconnect
  useEffect(() => {
    let reconnectTimeout = null;

    function connectWs() {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          console.log("[WS] Connected to AgentGuard Gateway");
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const { type, data } = msg;

            if (type === "action") {
              setActions((prev) => {
                const idx = prev.findIndex((a) => a.id === data.id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], ...data };
                  return updated;
                }
                return [data, ...prev];
              });
              // Refresh stats
              fetch(`${API_BASE}/api/stats`)
                .then((r) => r.json())
                .then((s) => setStats(s))
                .catch(() => {});
            } else if (type === "approval") {
              setApprovals((prev) => {
                const idx = prev.findIndex((a) => a.id === data.id || a.action_id === data.action_id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], ...data };
                  return updated;
                }
                return [data, ...prev];
              });
              if (data.status === "pending") {
                addToast(`Pending approval required for action ${data.action_id}`, "warning");
              }
              // Refresh stats
              fetch(`${API_BASE}/api/stats`)
                .then((r) => r.json())
                .then((s) => setStats(s))
                .catch(() => {});
            } else if (type === "alert") {
              setAlerts((prev) => [data, ...prev]);
              addToast(`Alert [${data.severity.toUpperCase()}]: ${data.message}`, "error");
              // Refresh stats
              fetch(`${API_BASE}/api/stats`)
                .then((r) => r.json())
                .then((s) => setStats(s))
                .catch(() => {});
            } else if (type === "agent") {
              setAgents((prev) =>
                prev.map((a) => (a.id === data.agent_id ? { ...a, status: data.status } : a))
              );
              addToast(`Agent ${data.agent_id} status changed to ${data.status}`, "warning");
              // Refresh stats
              fetch(`${API_BASE}/api/stats`)
                .then((r) => r.json())
                .then((s) => setStats(s))
                .catch(() => {});
            }
          } catch (e) {
            console.error("WS message parse error:", e);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          console.log("[WS] Disconnected, scheduling reconnect...");
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.warn("WebSocket init error:", err);
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    }

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [addToast]);

  return {
    actions,
    approvals,
    alerts,
    agents,
    stats,
    connected,
    toasts,
    addToast,
    refreshData: fetchInitialData,
  };
}
