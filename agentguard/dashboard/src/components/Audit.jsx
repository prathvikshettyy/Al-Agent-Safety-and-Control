import React, { useState, useEffect } from "react";
import { Lock, ShieldCheck, AlertTriangle, Download, RefreshCw, Database } from "lucide-react";

export function Audit() {
  const [log, setLog] = useState([]);
  const [verifyStatus, setVerifyStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchLog = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/audit?limit=100");
      const data = await res.json();
      if (data.audit_log) setLog(data.audit_log);
    } catch (e) {
      console.error("Failed fetching audit log:", e);
    }
  };

  useEffect(() => {
    fetchLog();
  }, []);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/audit/verify");
      const data = await res.json();
      setVerifyStatus(data);
    } catch (e) {
      setVerifyStatus({ ok: false, message: "Verification request failed." });
    } finally {
      setVerifying(false);
    }
  };

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(log, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `agentguard_audit_log_${new Date().toISOString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredLog = log.filter((entry) => {
    const text = (
      (entry.event_type || "") +
      " " +
      (entry.agent_id || "") +
      " " +
      (entry.actor || "") +
      " " +
      JSON.stringify(entry.payload || {})
    ).toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Header & Verification Bar */}
      <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">Tamper-Evident SHA-256 Audit Chain</h2>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {log.length} records
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? "animate-spin" : ""}`} />
              Verify Chain Integrity
            </button>

            <button
              onClick={exportJSON}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-1.5 px-3 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
          </div>
        </div>

        {/* Verification Status Banner */}
        {verifyStatus && (
          <div
            className={`p-3 rounded-lg border flex items-center justify-between text-xs font-medium transition-all ${
              verifyStatus.ok
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40"
                : "bg-rose-950/60 text-rose-200 border-rose-500/60"
            }`}
          >
            <div className="flex items-center gap-2">
              {verifyStatus.ok ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
              <span>{verifyStatus.message}</span>
            </div>
            <span className="font-mono text-[11px] opacity-80">
              Verified: {verifyStatus.checked} items
            </span>
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Filter audit log by event, agent, or payload contents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      {/* Audit Table */}
      <div className="bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-3 w-16 text-center">Seq</th>
                <th className="py-3 px-3">Event Type</th>
                <th className="py-3 px-3">Agent</th>
                <th className="py-3 px-3">Actor</th>
                <th className="py-3 px-3">Payload Summary</th>
                <th className="py-3 px-3 font-mono">Prev Hash</th>
                <th className="py-3 px-3 font-mono">Entry Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredLog.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-500">
                    No matching audit entries.
                  </td>
                </tr>
              ) : (
                filteredLog.map((entry) => (
                  <tr key={entry.seq} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold">
                      #{entry.seq}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono font-semibold text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30">
                        {entry.event_type}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {entry.agent_id || "-"}
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          entry.actor.startsWith("human")
                            ? "bg-purple-950 text-purple-300 border border-purple-800"
                            : entry.actor.startsWith("system")
                            ? "bg-slate-800 text-slate-300 border border-slate-700"
                            : "bg-blue-950 text-blue-300 border border-blue-800"
                        }`}
                      >
                        {entry.actor}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 max-w-xs truncate text-slate-400 font-mono text-[11px]" title={JSON.stringify(entry.payload)}>
                      {JSON.stringify(entry.payload)}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500" title={entry.prev_hash}>
                      {entry.prev_hash === "GENESIS" ? (
                        <span className="text-emerald-400 font-bold">GENESIS</span>
                      ) : (
                        entry.prev_hash.slice(0, 10) + "..."
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-400 font-semibold" title={entry.hash}>
                      {entry.hash.slice(0, 12)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
