import React, { useState } from "react";
import { Shield, Activity, Clock, Bot, AlertCircle, Lock, Sparkles, Terminal } from "lucide-react";
import { useFeed } from "./useFeed";
import { StatsHeader } from "./components/StatsHeader";
import { ScenarioRunner } from "./components/ScenarioRunner";
import { LiveFeed } from "./components/LiveFeed";
import { Approvals } from "./components/Approvals";
import { Agents } from "./components/Agents";
import { Alerts } from "./components/Alerts";
import { Audit } from "./components/Audit";
import { ActionDrawer } from "./components/ActionDrawer";

const API_BASE = "http://127.0.0.1:8000";

export default function App() {
  const { actions, approvals, alerts, agents, stats, connected, toasts, addToast, refreshData } = useFeed();
  const [activeTab, setActiveTab] = useState("feed");
  const [selectedAction, setSelectedAction] = useState(null);

  // Approval actions
  const handleApprove = async (approvalId, note) => {
    try {
      const res = await fetch(`${API_BASE}/api/approvals/${approvalId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer: "security_lead", note })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Approval #${approvalId} authorized. Tool executed successfully!`, "success");
        refreshData();
      } else {
        addToast(`Approval failed: ${data.detail || data.error}`, "error");
      }
    } catch (e) {
      addToast(`Error approving action: ${e.message}`, "error");
    }
  };

  const handleDeny = async (approvalId, note) => {
    try {
      const res = await fetch(`${API_BASE}/api/approvals/${approvalId}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer: "security_lead", note })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Action #${approvalId} has been denied and blocked.`, "info");
        refreshData();
      } else {
        addToast(`Deny failed: ${data.detail || data.error}`, "error");
      }
    } catch (e) {
      addToast(`Error denying action: ${e.message}`, "error");
    }
  };

  // Agent control actions
  const handlePauseAgent = async (agentId) => {
    try {
      await fetch(`${API_BASE}/api/agents/${agentId}/pause`, { method: "POST" });
      addToast(`Agent ${agentId} paused.`, "warning");
      refreshData();
    } catch (e) {
      addToast(`Error: ${e.message}`, "error");
    }
  };

  const handleResumeAgent = async (agentId) => {
    try {
      await fetch(`${API_BASE}/api/agents/${agentId}/resume`, { method: "POST" });
      addToast(`Agent ${agentId} resumed to active.`, "success");
      refreshData();
    } catch (e) {
      addToast(`Error: ${e.message}`, "error");
    }
  };

  const handleKillAgent = async (agentId) => {
    try {
      await fetch(`${API_BASE}/api/agents/${agentId}/kill`, { method: "POST" });
      addToast(`EMERGENCY: Agent ${agentId} killed! API key revoked.`, "error");
      refreshData();
    } catch (e) {
      addToast(`Error: ${e.message}`, "error");
    }
  };

  // Alert acknowledgement
  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await fetch(`${API_BASE}/api/alerts/${alertId}/ack`, { method: "POST" });
      addToast("Security alert acknowledged.", "info");
      refreshData();
    } catch (e) {
      addToast(`Error: ${e.message}`, "error");
    }
  };

  const pendingApprovalsCount = approvals.filter((a) => a.status === "pending").length;
  const unackedAlertsCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col antialiased selection:bg-cyan-500/30">
      {/* Top Brand Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent">
                  AgentGuard
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40 font-bold">
                  v1.0 MVP
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                AI Agent Safety, Control & Tamper-Evident Interception Gateway
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800/80 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("feed")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === "feed"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Feed</span>
            </button>

            <button
              onClick={() => setActiveTab("approvals")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition relative ${
                activeTab === "approvals"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Approvals</span>
              {pendingApprovalsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute top-1.5 right-1.5" />
              )}
            </button>

            <button
              onClick={() => setActiveTab("agents")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === "agents"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Agents</span>
            </button>

            <button
              onClick={() => setActiveTab("alerts")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition relative ${
                activeTab === "alerts"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Alerts</span>
              {unackedAlertsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping absolute top-1.5 right-1.5" />
              )}
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === "audit"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Audit Chain</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">
        {/* Top Operational Metrics */}
        <StatsHeader stats={stats} connected={connected} />

        {/* 1-Click Interactive Demo Scenario Bar */}
        <ScenarioRunner addToast={addToast} />

        {/* Tab Panels */}
        {activeTab === "feed" && (
          <LiveFeed actions={actions} onSelectAction={(act) => setSelectedAction(act)} />
        )}

        {activeTab === "approvals" && (
          <Approvals
            approvals={approvals}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        )}

        {activeTab === "agents" && (
          <Agents
            agents={agents}
            onPause={handlePauseAgent}
            onResume={handleResumeAgent}
            onKill={handleKillAgent}
          />
        )}

        {activeTab === "alerts" && (
          <Alerts alerts={alerts} onAcknowledge={handleAcknowledgeAlert} />
        )}

        {activeTab === "audit" && <Audit />}
      </main>

      {/* Slide-over Action Detail Drawer */}
      <ActionDrawer action={selectedAction} onClose={() => setSelectedAction(null)} />

      {/* Toast Notification Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xl backdrop-blur-md transition-all animate-bounce flex items-center gap-2 max-w-sm ${
              t.type === "error"
                ? "bg-rose-950/90 text-rose-200 border-rose-500/50"
                : t.type === "warning"
                ? "bg-amber-950/90 text-amber-200 border-amber-500/50"
                : t.type === "success"
                ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/50"
                : "bg-slate-900/90 text-slate-200 border-slate-700"
            }`}
          >
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
