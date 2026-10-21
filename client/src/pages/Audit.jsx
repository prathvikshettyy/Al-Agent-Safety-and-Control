import React, { useState, useEffect } from 'react';
import {
  History,
  ShieldCheck,
  ShieldAlert,
  Download,
  RefreshCw,
  Hash,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertOctagon
} from 'lucide-react';
import { api } from '../api';

export function Audit() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const fetchAudit = async (currentOffset = 0) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAudit(limit, currentOffset);
      setEntries(res.entries || []);
      setTotal(res.total || 0);
      setOffset(currentOffset);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit(0);
  }, []);

  const handleVerifyChain = async () => {
    try {
      setVerifying(true);
      setVerifyResult(null);
      const result = await api.verifyAudit();
      setVerifyResult(result);
    } catch (err) {
      setVerifyResult({ ok: false, reason: err.message });
    } finally {
      setVerifying(false);
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(entries, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `agentguard_audit_chain_${new Date().toISOString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Cryptographic Audit Chain</h2>
          <p className="text-xs text-slate-400">
            Append-only, SHA-256 sealed tamper-evident security ledger
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleExportJson}
            className="flex items-center space-x-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <Download className="h-4 w-4 text-cyan-400" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="flex items-center space-x-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500 transition shadow-lg shadow-purple-600/20 disabled:opacity-50"
          >
            {verifying ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            <span>Verify Chain Integrity</span>
          </button>
        </div>
      </div>

      {/* Chain Verification Result Toast */}
      {verifyResult && (
        <div
          className={`rounded-2xl border p-4.5 text-xs animate-fade-in ${
            verifyResult.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-3">
            {verifyResult.ok ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertOctagon className="h-5 w-5 shrink-0 text-rose-400" />
            )}
            <div>
              <h4 className="font-bold text-sm text-white">
                {verifyResult.ok ? 'Cryptographic Chain Validated' : 'TAMPER DETECTED IN LEDGER'}
              </h4>
              <p className="mt-0.5">
                {verifyResult.ok
                  ? `All ${verifyResult.checked} entries verified sequentially from Genesis. No cryptographic drift or unauthorized mutations found.`
                  : `Integrity compromised at Sequence #${verifyResult.firstBadSeq}! Reason: ${verifyResult.reason}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Seq</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">SHA-256 Hash</th>
                <th className="py-3 px-4">Previous Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <tr key={entry.seq} className="hover:bg-slate-800/50 transition">
                    <td className="py-3 px-4 text-purple-400 font-bold whitespace-nowrap">
                      #{entry.seq}
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(entry.ts).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-cyan-300 font-bold whitespace-nowrap font-sans">
                      {entry.event_type}
                    </td>
                    <td className="py-3 px-4 text-slate-300 whitespace-nowrap font-sans">
                      {entry.actor}
                    </td>
                    <td className="py-3 px-4 text-purple-300 whitespace-nowrap font-mono max-w-[200px] truncate" title={entry.hash}>
                      {entry.hash}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono max-w-[160px] truncate" title={entry.prev_hash}>
                      {entry.prev_hash}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-sans">
                    {loading ? 'Reading audit ledger records...' : 'No audit entries recorded yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 bg-slate-950/60 text-xs text-slate-400">
          <span>
            Showing {entries.length > 0 ? offset + 1 : 0} to {Math.min(offset + limit, total)} of {total} records
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchAudit(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => fetchAudit(offset + limit)}
              disabled={offset + limit >= total}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
