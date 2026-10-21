import React, { useState } from "react";
import { Bot, Play, Pause, Skull, AlertOctagon } from "lucide-react";

export function Agents({ agents, onPause, onResume, onKill }) {
  const [killModalAgent, setKillModalAgent] = useState(null);

  const confirmKill = async () => {
    if (killModalAgent) {
      await onKill(killModalAgent.id);
      setKillModalAgent(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-semibold text-slate-100">Registered Agents & Fleet Control</h2>
        </div>
        <p className="text-xs text-slate-400">
          Central management console for agent lifecycle, operational state, and emergency kill switches.
        </p>
      </div>

      {/* Agents Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((ag) => {
          const isActive = ag.status === "ACTIVE";
          const isPaused = ag.status === "PAUSED";
          const isKilled = ag.status === "KILLED";

          return (
            <div
              key={ag.id}
              className="bg-slate-900/70 rounded-xl border border-slate-800 p-5 shadow-lg flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-slate-800 rounded-lg text-cyan-400">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-mono text-sm font-bold text-white">{ag.id}</div>
                      <div className="text-[11px] text-slate-400 capitalize">{ag.role}</div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isActive
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : isPaused
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {ag.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Interceptions</span>
                    <span className="text-slate-200 font-mono font-semibold">{ag.total_actions || 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">API Key</span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      {isKilled ? "REVOKED" : "HASHED"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                {isPaused ? (
                  <button
                    onClick={() => onResume(ag.id)}
                    className="flex-1 bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-medium py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </button>
                ) : (
                  <button
                    disabled={isKilled}
                    onClick={() => onPause(ag.id)}
                    className="flex-1 bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-medium py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                )}

                <button
                  disabled={isKilled}
                  onClick={() => setKillModalAgent(ag)}
                  className="bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 hover:text-white text-xs font-medium py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Kill Switch: Permanently revoke credentials"
                >
                  <Skull className="w-3.5 h-3.5" />
                  Kill
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal for Kill Switch */}
      {killModalAgent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-600/60 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertOctagon className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-white">Emergency Kill Switch Confirmation</h3>
              <p className="text-xs text-slate-300">
                Are you sure you want to trigger the kill switch for agent{" "}
                <span className="font-mono text-cyan-400 font-bold">{killModalAgent.id}</span>?
              </p>
              <div className="bg-rose-950/40 border border-rose-900/60 p-3 rounded-lg text-left text-xs text-rose-200">
                ⚠️ This action is irreversible. The agent's API key will be permanently invalidated and all future requests will be rejected with HTTP 403 Forbidden.
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setKillModalAgent(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-4 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmKill}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold py-2 px-4 rounded-xl transition shadow-lg shadow-rose-900/40"
              >
                Confirm & Kill Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
