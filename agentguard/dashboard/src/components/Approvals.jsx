import React, { useState } from "react";
import { Check, X, Clock, AlertTriangle, ShieldCheck, UserCheck } from "lucide-react";

export function Approvals({ approvals, onApprove, onDeny }) {
  const [notes, setNotes] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  const handleAction = async (id, type) => {
    setLoadingId(id);
    const noteText = notes[id] || (type === "approve" ? "Approved by security operator" : "Denied by security operator");
    if (type === "approve") {
      await onApprove(id, noteText);
    } else {
      await onDeny(id, noteText);
    }
    setLoadingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-2">
          <Clock className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-semibold text-slate-100">Human-In-The-Loop Approval Queue</h2>
          <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
            {pendingApprovals.length} pending
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Risky and high-impact actions intercepted by policy awaiting human authorization.
        </p>
      </div>

      {/* Cards Grid */}
      {pendingApprovals.length === 0 ? (
        <div className="bg-slate-900/30 rounded-xl border border-slate-800/80 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">Approval Queue Clear</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All agent actions have been resolved or authorized. Escalated actions will immediately appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingApprovals.map((appr) => (
            <div
              key={appr.id}
              className="bg-slate-900/80 rounded-xl border border-amber-500/30 p-5 shadow-lg flex flex-col justify-between space-y-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                      {appr.agent_id}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">#{appr.id}</span>
                  </div>
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                    Risk Score: {appr.risk_score}
                  </span>
                </div>

                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Attempted Tool</div>
                  <div className="text-base font-mono font-bold text-slate-100">{appr.tool}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Task Context</div>
                  <div className="text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                    {appr.task_context}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Arguments</div>
                  <pre className="text-[11px] font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-emerald-400 overflow-x-auto">
                    {JSON.stringify(appr.args, null, 2)}
                  </pre>
                </div>

                {/* Reviewer Note Input */}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Reviewer Justification Note</label>
                  <input
                    type="text"
                    placeholder="e.g., Authorized verified refund request"
                    value={notes[appr.id] || ""}
                    onChange={(e) => setNotes({ ...notes, [appr.id]: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  disabled={loadingId === appr.id}
                  onClick={() => handleAction(appr.id, "approve")}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition shadow-sm disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Approve & Execute
                </button>
                <button
                  disabled={loadingId === appr.id}
                  onClick={() => handleAction(appr.id, "deny")}
                  className="flex-1 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition shadow-sm disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Deny Action
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
