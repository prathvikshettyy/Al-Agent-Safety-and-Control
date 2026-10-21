import React from "react";
import { Shield, ShieldAlert, AlertTriangle, Radio, Bot, CheckCircle } from "lucide-react";

export function StatsHeader({ stats, connected }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Total Actions */}
      <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Intercepted</span>
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="text-xl font-bold font-mono text-white">{stats.total_actions}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Total agent calls</div>
      </div>

      {/* Block Rate */}
      <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Block Rate</span>
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        </div>
        <div className="text-xl font-bold font-mono text-rose-400">{stats.block_rate_pct}%</div>
        <div className="text-[10px] text-slate-500 mt-0.5">{stats.blocked_actions} hard blocked</div>
      </div>

      {/* Pending Approvals */}
      <div
        className={`bg-slate-900/70 border p-3.5 rounded-xl shadow transition ${
          stats.pending_approvals > 0 ? "border-amber-500/50 bg-amber-950/10" : "border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Pending Approvals</span>
          <AlertTriangle
            className={`w-3.5 h-3.5 ${stats.pending_approvals > 0 ? "text-amber-400 animate-pulse" : "text-slate-500"}`}
          />
        </div>
        <div className="text-xl font-bold font-mono text-amber-400">{stats.pending_approvals}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Awaiting human review</div>
      </div>

      {/* Active Alerts */}
      <div
        className={`bg-slate-900/70 border p-3.5 rounded-xl shadow transition ${
          stats.active_alerts > 0 ? "border-rose-500/50 bg-rose-950/10" : "border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Active Alerts</span>
          <ShieldAlert
            className={`w-3.5 h-3.5 ${stats.active_alerts > 0 ? "text-rose-400 animate-bounce" : "text-slate-500"}`}
          />
        </div>
        <div className="text-xl font-bold font-mono text-rose-400">{stats.active_alerts}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Anomalies & flags</div>
      </div>

      {/* Agents Active */}
      <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Active Fleet</span>
          <Bot className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="text-xl font-bold font-mono text-cyan-400">
          {stats.active_agents} <span className="text-xs text-slate-500 font-normal">/ {stats.total_agents}</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">Operational agents</div>
      </div>

      {/* Gateway Live Status */}
      <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl shadow flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>Gateway Link</span>
          <Radio className={`w-3.5 h-3.5 ${connected ? "text-emerald-400 animate-pulse" : "text-rose-400"}`} />
        </div>
        <div className="flex items-center space-x-1.5 mt-1">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-500"}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${connected ? "text-emerald-400" : "text-rose-400"}`}>
            {connected ? "LIVE FEED ACTIVE" : "CONNECTING..."}
          </span>
        </div>
        <div className="text-[10px] text-slate-500">WebSocket /ws/feed</div>
      </div>
    </div>
  );
}
