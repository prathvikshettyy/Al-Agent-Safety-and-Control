import React from "react";
import { X, ShieldCheck, ShieldAlert, AlertTriangle, Cpu, CheckCircle2, FileText, Lock } from "lucide-react";

export function ActionDrawer({ action, onClose }) {
  if (!action) return null;

  const isAllow = action.decision === "ALLOW";
  const isBlock = action.decision === "BLOCK";
  const isEscalate = action.decision === "ESCALATE";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end transition-opacity">
      <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto shadow-2xl p-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <span
              className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
                isAllow
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : isBlock
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              }`}
            >
              {isAllow && <ShieldCheck className="w-3.5 h-3.5" />}
              {isBlock && <ShieldAlert className="w-3.5 h-3.5" />}
              {isEscalate && <AlertTriangle className="w-3.5 h-3.5" />}
              {action.decision}
            </span>
            <span className="text-xs text-slate-400 font-mono">{action.id}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-6 space-y-6 flex-1">
          {/* Tool & Agent Overview */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Intercepted Tool</div>
                <div className="text-lg font-semibold text-white font-mono">{action.tool}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Agent ID</div>
                <div className="text-sm font-medium text-cyan-400 font-mono">{action.agent_id}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Declared Task Context</div>
              <div className="text-sm text-slate-200 bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                {action.task_context || "No context provided"}
              </div>
            </div>
          </div>

          {/* Risk Score Gauge */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Composite Risk Assessment
              </span>
              <span
                className={`text-sm font-bold font-mono ${
                  action.risk_score >= 70
                    ? "text-rose-400"
                    : action.risk_score >= 35
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {action.risk_score} / 100
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  action.risk_score >= 70
                    ? "bg-gradient-to-r from-amber-500 to-rose-500"
                    : action.risk_score >= 35
                    ? "bg-gradient-to-r from-emerald-500 to-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.max(5, action.risk_score)}%` }}
              />
            </div>
            {/* Reasons / Rules hit */}
            {(action.reasons?.length > 0 || action.rule_ids?.length > 0) && (
              <div className="mt-3 space-y-1.5">
                <div className="text-xs text-slate-400 font-medium">Evaluation Factors:</div>
                <ul className="text-xs text-slate-300 space-y-1">
                  {action.rule_ids?.map((rid) => (
                    <li key={rid} className="flex items-center gap-1.5 text-amber-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Policy Rule Hit: <code className="bg-slate-800 px-1 py-0.5 rounded">{rid}</code>
                    </li>
                  ))}
                  {action.reasons?.map((reason, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-slate-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Claude LLM Judge Panel */}
          {action.judge && (
            <div className="bg-gradient-to-br from-indigo-950/40 to-slate-950/80 p-4 rounded-xl border border-indigo-900/40">
              <div className="flex items-center gap-2 mb-2 text-indigo-400">
                <Cpu className="w-4 h-4" />
                <span className="text-xs uppercase font-bold tracking-wider">AI Security Judge (Claude)</span>
              </div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-400">Alignment:</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded ${
                    action.judge.aligned ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"
                  }`}
                >
                  {action.judge.aligned ? "ALIGNED" : "MISALIGNED / SUSPICIOUS"}
                </span>
                <span className="text-slate-400">Confidence: {(action.judge.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="text-xs text-indigo-200 bg-indigo-950/30 p-2.5 rounded-lg border border-indigo-900/30">
                {action.judge.reason}
              </div>
            </div>
          )}

          {/* Action Arguments */}
          <div className="space-y-1.5">
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Tool Arguments (Redacted & Sealed)
            </div>
            <pre className="text-xs font-mono bg-slate-950 p-3.5 rounded-xl border border-slate-800 overflow-x-auto text-emerald-400">
              {JSON.stringify(action.args, null, 2)}
            </pre>
          </div>

          {/* Execution Result */}
          {action.result && (
            <div className="space-y-1.5">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Execution Output
              </div>
              <pre className="text-xs font-mono bg-slate-950 p-3.5 rounded-xl border border-emerald-900/40 overflow-x-auto text-slate-200">
                {JSON.stringify(action.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Cryptographic Hash Chain Seal */}
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Audit Chain Integrity</span>
            </div>
            <span className="text-emerald-400 font-medium">Secured in SHA-256 Ledger</span>
          </div>
        </div>
      </div>
    </div>
  );
}
