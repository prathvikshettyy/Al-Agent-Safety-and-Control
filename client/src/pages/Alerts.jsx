import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, RefreshCw, ExternalLink, Filter } from 'lucide-react';
import { api } from '../api';

export function Alerts({ onSelectAction, feedUpdates }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('');

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAlerts();
      setAlerts(res.alerts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Update on real-time alerts
  useEffect(() => {
    if (feedUpdates && feedUpdates.type === 'alert') {
      fetchAlerts();
    }
  }, [feedUpdates]);

  const handleAcknowledge = async (id) => {
    try {
      await api.acknowledgeAlert(id);
      await fetchAlerts();
    } catch (err) {
      alert(`Failed to acknowledge alert: ${err.message}`);
    }
  };

  const filtered = alerts.filter((a) => !filterSeverity || a.severity === filterSeverity);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Security Incident & Alert Center</h2>
          <p className="text-xs text-slate-400">Automated prompt injection detections, velocity bursts, and anomalies</p>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <button
            onClick={fetchAlerts}
            className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white transition"
            title="Refresh alerts"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length > 0 ? (
          filtered.map((alt) => {
            const isAck = alt.acknowledged === 1;
            const isCritical = alt.severity === 'critical';
            const isHigh = alt.severity === 'high';

            return (
              <div
                key={alt.id}
                className={`rounded-2xl border p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                  isAck
                    ? 'border-slate-800/80 bg-slate-950/40 opacity-60'
                    : isCritical
                    ? 'border-rose-500/40 bg-rose-500/10'
                    : isHigh
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-slate-800 bg-slate-900/60'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  <div
                    className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                      isCritical
                        ? 'bg-rose-500/20 text-rose-400'
                        : isHigh
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <ShieldAlert className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span
                        className={`font-bold px-2 py-0.2 rounded text-[10px] uppercase tracking-wider ${
                          isCritical
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : isHigh
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {alt.severity}
                      </span>
                      <span className="font-mono text-xs text-slate-400">ID: {alt.id}</span>
                      {isAck && (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.2 rounded border border-emerald-800/30">
                          ACKNOWLEDGED
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-white">{alt.message}</h4>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                      <span>Agent: <strong className="text-cyan-300">{alt.agent_id}</strong></span>
                      <span>Type: <strong className="text-slate-300">{alt.type}</strong></span>
                      <span>{new Date(alt.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 sm:self-center">
                  {!isAck && (
                    <button
                      onClick={() => handleAcknowledge(alt.id)}
                      className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center text-xs text-slate-400">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3 opacity-80" />
            <p className="text-sm font-bold text-white mb-1">No Active Incidents</p>
            <p className="text-slate-500">All alerts have been reviewed or none match the selected filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
