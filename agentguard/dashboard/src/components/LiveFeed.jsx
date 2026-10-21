import React, { useState } from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, Filter, ChevronRight, Activity } from "lucide-react";

export function LiveFeed({ actions, onSelectAction }) {
  const [filterDecision, setFilterDecision] = useState("ALL");
  const [filterAgent, setFilterAgent] = useState("ALL");

  const filtered = actions.filter((act) => {
    if (filterDecision !== "ALL" && act.decision !== filterDecision) return false;
    if (filterAgent !== "ALL" && act.agent_id !== filterAgent) return false;
    return true;
  });

  const uniqueAgents = Array.from(new Set(actions.map((a) => a.agent_id).filter(Boolean)));

  return (
    <div className="space-y-4">
      {/* Controls & Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">Real-Time Interception Stream</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
            {filtered.length} actions
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Decision Filter Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {["ALL", "ALLOW", "BLOCK", "ESCALATE"].map((dec) => (
              <button
                key={dec}
                onClick={() => setFilterDecision(dec)}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  filterDecision === dec
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {dec}
              </button>
            ))}
          </div>

          {/* Agent Filter Dropdown */}
          {uniqueAgents.length > 0 && (
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="ALL">All Agents</option>
              {uniqueAgents.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Actions Table */}
      <div className="bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Decision</th>
                <th className="py-3 px-4">Agent</th>
                <th className="py-3 px-4">Tool</th>
                <th className="py-3 px-4">Task Context</th>
                <th className="py-3 px-4 text-center">Risk Score</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500">
                    No intercepted actions recorded yet. Run a scenario or send requests to /v1/execute.
                  </td>
                </tr>
              ) : (
                filtered.map((act) => {
                  const isAllow = act.decision === "ALLOW";
                  const isBlock = act.decision === "BLOCK";
                  const isEscalate = act.decision === "ESCALATE";

                  return (
                    <tr
                      key={act.id}
                      onClick={() => onSelectAction(act)}
                      className="hover:bg-slate-800/40 cursor-pointer transition group"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                            isAllow
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : isBlock
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {isAllow && <ShieldCheck className="w-3 h-3" />}
                          {isBlock && <ShieldAlert className="w-3 h-3" />}
                          {isEscalate && <AlertTriangle className="w-3 h-3" />}
                          {act.decision}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30">
                          {act.agent_id}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-200 font-semibold">
                        {act.tool}
                      </td>

                      <td className="py-3 px-4 max-w-xs truncate text-slate-400" title={act.task_context}>
                        {act.task_context || "-"}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded ${
                            act.risk_score >= 70
                              ? "bg-rose-950/60 text-rose-400 border border-rose-800/50"
                              : act.risk_score >= 35
                              ? "bg-amber-950/60 text-amber-400 border border-amber-800/50"
                              : "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                          }`}
                        >
                          {act.risk_score}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                            act.status === "executed"
                              ? "bg-emerald-900/40 text-emerald-400"
                              : act.status === "pending"
                              ? "bg-amber-900/40 text-amber-400 animate-pulse"
                              : act.status === "blocked"
                              ? "bg-rose-900/40 text-rose-400"
                              : act.status === "denied"
                              ? "bg-slate-800 text-slate-400"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {act.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition inline-block" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
