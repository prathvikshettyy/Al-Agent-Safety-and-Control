import React from 'react';
import { X, ShieldAlert, CheckCircle2, AlertOctagon, HelpCircle, Hash, ExternalLink, Cpu, Terminal } from 'lucide-react';

export function ActionDrawer({ action, onClose }) {
  if (!action) return null;

  const getDecisionBadge = (decision) => {
    switch (decision) {
      case 'ALLOW':
        return (
          <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>ALLOW</span>
          </span>
        );
      case 'BLOCK':
        return (
          <span className="inline-flex items-center space-x-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-3 py-1 text-xs font-bold text-rose-400">
            <AlertOctagon className="h-3.5 w-3.5" />
            <span>BLOCK</span>
          </span>
        );
      case 'ESCALATE':
        return (
          <span className="inline-flex items-center space-x-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-400">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>ESCALATE</span>
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{decision}</span>;
    }
  };

  const riskColor =
    action.risk_score > 60
      ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
      : action.risk_score > 30
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            {getDecisionBadge(action.decision)}
            <div>
              <h3 className="text-sm font-bold text-white font-mono">{action.id}</h3>
              <p className="text-xs text-slate-400">{new Date(action.created_at).toLocaleString()}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Agent & Tool Details */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Agent</span>
              <span className="font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded">
                {action.agent_id}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Tool Invoked</span>
              <span className="font-mono text-purple-300 font-medium">{action.tool}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Execution Status</span>
              <span className="font-semibold text-slate-200 capitalize">{action.status}</span>
            </div>
            {action.task_context && (
              <div className="pt-2 border-t border-slate-800/60">
                <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Task Context
                </span>
                <p className="text-xs text-slate-300 italic bg-slate-900/60 p-2 rounded border border-slate-800">
                  "{action.task_context}"
                </p>
              </div>
            )}
          </div>

          {/* Risk Scoring & Taint Status */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk Evaluation</span>
              <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${riskColor}`}>
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Score: {action.risk_score} / 100</span>
              </div>
            </div>

            {action.tainted === 1 && (
              <div className="flex items-center space-x-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-300">
                <AlertOctagon className="h-4 w-4 shrink-0 text-rose-400" />
                <span>
                  <strong>Session Tainted:</strong> Prompt injection payload detected in agent session history.
                </span>
              </div>
            )}
          </div>

          {/* Matched Policy Rules */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Policy Rule Match
            </span>
            {action.rule_ids && action.rule_ids.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {action.rule_ids.map((ruleId) => (
                  <span
                    key={ruleId}
                    className="font-mono text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700 text-amber-300"
                  >
                    {ruleId}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No rule triggers (passed standard allowlist).</p>
            )}
          </div>

          {/* Tool Arguments */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
            <div className="flex items-center space-x-2">
              <Terminal className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tool Arguments</span>
            </div>
            <pre className="font-mono text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto">
              {JSON.stringify(action.args, null, 2)}
            </pre>
          </div>

          {/* Execution Result */}
          {action.result && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Execution Output</span>
              <pre className="font-mono text-xs text-emerald-300 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto">
                {JSON.stringify(action.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Cryptographic Audit Chain Record */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
            <div className="flex items-center space-x-2">
              <Hash className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Cryptographic Audit Chain Seal
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1 text-xs">
              {action.audit_seq && (
                <div className="flex justify-between text-slate-400">
                  <span>Ledger Sequence:</span>
                  <span className="font-mono text-white font-bold">#{action.audit_seq}</span>
                </div>
              )}
              <div className="text-slate-400 break-all font-mono text-[11px] pt-1">
                <span className="text-slate-500 block">SHA-256 Hash:</span>
                <span className="text-purple-300">{action.audit_hash || 'Pending hash sealing...'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
