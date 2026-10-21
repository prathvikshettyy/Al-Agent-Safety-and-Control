import React, { useState, useEffect } from 'react';
import { Bot, Play, Pause, Skull, RefreshCw, Activity, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import { api } from '../api';

export function Agents({ feedUpdates }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { action: 'pause' | 'resume' | 'kill', agent: obj }
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAgents();
      setAgents(res.agents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // Live WebSocket updates
  useEffect(() => {
    if (feedUpdates && feedUpdates.type === 'agent') {
      fetchAgents();
    }
  }, [feedUpdates]);

  const executeAgentAction = async () => {
    if (!confirmModal) return;
    try {
      setActionLoading(true);
      const { action, agent } = confirmModal;
      if (action === 'pause') {
        await api.pauseAgent(agent.id);
      } else if (action === 'resume') {
        await api.resumeAgent(agent.id);
      } else if (action === 'kill') {
        await api.killAgent(agent.id);
      }
      setConfirmModal(null);
      await fetchAgents();
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Autonomous Agent Fleet</h2>
          <p className="text-xs text-slate-400">Live operational states, throttle velocity, and emergency controls</p>
        </div>
        <button
          onClick={fetchAgents}
          className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white transition"
          title="Refresh agents"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {agents.map((agent) => {
          const isActive = agent.status === 'ACTIVE';
          const isPaused = agent.status === 'PAUSED';
          const isKilled = agent.status === 'KILLED';

          return (
            <div
              key={agent.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between space-y-4 shadow-xl transition ${
                isKilled
                  ? 'border-rose-900/40 bg-slate-950/80 opacity-70'
                  : isPaused
                  ? 'border-amber-500/30 bg-slate-900/80'
                  : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 rounded-xl bg-slate-800 text-cyan-400">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono">{agent.id}</h3>
                      <span className="text-[11px] text-slate-400 capitalize">{agent.role.replace('_', ' ')}</span>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : isPaused
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {agent.status}
                  </span>
                </div>

                {/* Telemetry info */}
                <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center space-x-1">
                      <Activity className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Velocity (Last Hour):</span>
                    </span>
                    <span className="font-mono text-white font-bold">{agent.actions_last_hour} calls</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center space-x-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>Last Action:</span>
                    </span>
                    <span className="font-mono text-slate-300">
                      {agent.last_action ? new Date(agent.last_action.created_at).toLocaleTimeString() : 'None'}
                    </span>
                  </div>

                  {agent.last_action && (
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60 mt-2 font-mono text-[11px]">
                      <div className="text-slate-400 flex justify-between">
                        <span>Last Tool:</span>
                        <span className="text-purple-300">{agent.last_action.tool}</span>
                      </div>
                      <div className="text-slate-400 flex justify-between mt-0.5">
                        <span>Verdict:</span>
                        <span
                          className={
                            agent.last_action.decision === 'ALLOW'
                              ? 'text-emerald-400'
                              : agent.last_action.decision === 'BLOCK'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }
                        >
                          {agent.last_action.decision}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-3 border-t border-slate-800/80">
                {isActive && (
                  <button
                    onClick={() => setConfirmModal({ action: 'pause', agent })}
                    className="flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    <span>Pause</span>
                  </button>
                )}

                {isPaused && (
                  <button
                    onClick={() => setConfirmModal({ action: 'resume', agent })}
                    className="flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Resume</span>
                  </button>
                )}

                {!isKilled && (
                  <button
                    onClick={() => setConfirmModal({ action: 'kill', agent })}
                    className="flex items-center justify-center space-x-1 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition"
                    title="Permanently revoke agent API key and trigger kill-switch"
                  >
                    <Skull className="h-3.5 w-3.5" />
                    <span>Kill</span>
                  </button>
                )}

                {isKilled && (
                  <div className="w-full text-center py-1 text-xs font-bold text-rose-400 font-mono">
                    PERMANENTLY REVOKED
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertCircle className="h-6 w-6" />
              <h3 className="text-base font-bold text-white capitalize">
                Confirm Agent {confirmModal.action}
              </h3>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to <strong>{confirmModal.action.toUpperCase()}</strong> agent{' '}
              <span className="font-mono text-cyan-300 font-bold">{confirmModal.agent.id}</span>?
              {confirmModal.action === 'kill' && (
                <span className="block mt-2 text-rose-400 font-semibold">
                  WARNING: This triggers the Emergency Kill-Switch, permanently revoking its cryptographic API key credentials.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={actionLoading}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>

              <button
                onClick={executeAgentAction}
                disabled={actionLoading}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-white transition ${
                  confirmModal.action === 'kill'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-cyan-600 hover:bg-cyan-500'
                }`}
              >
                {actionLoading ? 'Executing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
