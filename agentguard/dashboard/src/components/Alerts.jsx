import React, { useState } from "react";
import { AlertCircle, CheckCircle, ShieldAlert, Zap, Bug } from "lucide-react";

export function Alerts({ alerts, onAcknowledge }) {
  const [filterUnacked, setFilterUnacked] = useState(true);

  const displayedAlerts = alerts.filter((a) => (filterUnacked ? !a.acknowledged : true));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-rose-400" />
          <h2 className="text-base font-semibold text-slate-100">Security Alerts & Anomalies</h2>
          <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
            {alerts.filter((a) => !a.acknowledged).length} active
          </span>
        </div>

        <button
          onClick={() => setFilterUnacked(!filterUnacked)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition ${
            filterUnacked
              ? "bg-slate-800 text-cyan-400 border-cyan-500/40"
              : "bg-slate-950 text-slate-400 border-slate-800"
          }`}
        >
          {filterUnacked ? "Showing Unacknowledged" : "Showing All Alerts"}
        </button>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {displayedAlerts.length === 0 ? (
          <div className="bg-slate-900/30 rounded-xl border border-slate-800/80 p-12 text-center text-slate-500 text-xs">
            No security alerts matching filter. Fleet is running within baseline parameters.
          </div>
        ) : (
          displayedAlerts.map((alt) => {
            const isCrit = alt.severity === "critical";
            const isHigh = alt.severity === "high";
            const isMed = alt.severity === "medium";

            return (
              <div
                key={alt.id}
                className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition shadow-md ${
                  alt.acknowledged
                    ? "bg-slate-950/40 border-slate-800/60 opacity-60"
                    : isCrit
                    ? "bg-gradient-to-r from-purple-950/30 to-slate-900 border-purple-500/40"
                    : isHigh
                    ? "bg-gradient-to-r from-rose-950/30 to-slate-900 border-rose-500/40"
                    : isMed
                    ? "bg-slate-900/80 border-amber-500/30"
                    : "bg-slate-900/80 border-slate-800"
                }`}
              >
                <div className="flex items-start space-x-3 flex-1">
                  <div
                    className={`p-2 rounded-lg mt-0.5 ${
                      isCrit
                        ? "bg-purple-500/20 text-purple-400"
                        : isHigh
                        ? "bg-rose-500/20 text-rose-400"
                        : isMed
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {alt.type === "injection" ? (
                      <Bug className="w-4 h-4" />
                    ) : alt.type === "anomaly" ? (
                      <Zap className="w-4 h-4" />
                    ) : (
                      <ShieldAlert className="w-4 h-4" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isCrit
                            ? "bg-purple-950 text-purple-300 border border-purple-800"
                            : isHigh
                            ? "bg-rose-950 text-rose-300 border border-rose-800"
                            : isMed
                            ? "bg-amber-950 text-amber-300 border border-amber-800"
                            : "bg-blue-950 text-blue-300 border border-blue-800"
                        }`}
                      >
                        {alt.severity}
                      </span>
                      <span className="text-xs font-mono text-cyan-400">{alt.agent_id}</span>
                      <span className="text-[11px] text-slate-500 uppercase tracking-wider">
                        • {alt.type}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 font-medium">{alt.message}</p>
                    <div className="text-[10px] text-slate-500 font-mono">{alt.created_at}</div>
                  </div>
                </div>

                {!alt.acknowledged && (
                  <button
                    onClick={() => onAcknowledge(alt.id)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 transition flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Acknowledge
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
