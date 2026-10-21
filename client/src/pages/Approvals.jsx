import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Terminal,
  MessageSquare
} from 'lucide-react';
import { api } from '../api';

export function Approvals({ feedUpdates, onSelectAction }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('pending'); // 'pending' | 'history'

  // Modal state for Approve/Deny
  const [actionModal, setActionModal] = useState(null); // { type: 'approve' | 'deny', approval: obj }
  const [reviewerName, setReviewerName] = useState('security_lead');
  const [decisionNote, setDecisionNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getApprovals();
      setApprovals(res.approvals || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  // Update real-time on WS events
  useEffect(() => {
    if (feedUpdates && feedUpdates.type === 'approval') {
      fetchApprovals();
    }
  }, [feedUpdates]);

  const handleApprove = async () => {
    if (!actionModal) return;
    try {
      setProcessing(true);
      await api.approve(actionModal.approval.id, reviewerName, decisionNote);
      setActionModal(null);
      setDecisionNote('');
      await fetchApprovals();
    } catch (err) {
      alert(`Approval execution failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeny = async () => {
    if (!actionModal) return;
    try {
      setProcessing(true);
      await api.deny(actionModal.approval.id, reviewerName, decisionNote);
      setActionModal(null);
      setDecisionNote('');
      await fetchApprovals();
    } catch (err) {
      alert(`Denial failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const pendingList = approvals.filter((a) => a.status === 'pending');
  const historyList = approvals.filter((a) => a.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Subtab Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setActiveSubTab('pending')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === 'pending'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Pending Review</span>
            <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] text-slate-950 font-bold">
              {pendingList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === 'history'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Review History</span>
            <span className="ml-1.5 rounded-full bg-slate-700 px-1.5 py-0.2 text-[10px] text-slate-300">
              {historyList.length}
            </span>
          </button>
        </div>

        <button
          onClick={fetchApprovals}
          className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white transition"
          title="Refresh approvals"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      {/* Pending Approvals List */}
      {activeSubTab === 'pending' && (
        <div className="space-y-4">
          {pendingList.length > 0 ? (
            pendingList.map((appr) => (
              <div
                key={appr.id}
                className="rounded-2xl border border-amber-500/30 bg-slate-900/80 p-5 space-y-4 shadow-xl hover:border-amber-500/50 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-3">
                    <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
                      ESCALATED ACTION
                    </span>
                    <span className="font-mono text-xs text-slate-400">Approval ID: {appr.id}</span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(appr.created_at).toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                        Target Agent
                      </span>
                      <span className="font-mono text-cyan-400 text-sm font-semibold">{appr.agent_id}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                        Tool Requested
                      </span>
                      <span className="font-mono text-purple-300 text-sm font-semibold">{appr.tool}</span>
                    </div>

                    {appr.task_context && (
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                          Task Context
                        </span>
                        <p className="text-slate-300 italic bg-slate-950 p-2 rounded border border-slate-800">
                          "{appr.task_context}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Arguments view */}
                  <div className="space-y-2">
                    <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                      Tool Execution Arguments
                    </span>
                    <pre className="font-mono text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-36 overflow-auto">
                      {JSON.stringify(appr.args, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Footer Controls: Approve & Deny */}
                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setActionModal({ type: 'deny', approval: appr })}
                    className="flex items-center space-x-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Deny Action</span>
                  </button>

                  <button
                    onClick={() => setActionModal({ type: 'approve', approval: appr })}
                    className="flex items-center space-x-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Approve & Execute</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center text-xs text-slate-400">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3 opacity-80" />
              <p className="text-sm font-bold text-white mb-1">Approval Queue Clean</p>
              <p className="text-slate-500">
                No escalated actions waiting for supervisor review. Trigger the "Refund" demo to generate an approval!
              </p>
            </div>
          )}
        </div>
      )}

      {/* History List */}
      {activeSubTab === 'history' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Resolved At</th>
                <th className="py-3 px-4">Action / Tool</th>
                <th className="py-3 px-4">Agent</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Reviewer</th>
                <th className="py-3 px-4">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {historyList.length > 0 ? (
                historyList.map((appr) => (
                  <tr key={appr.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 text-slate-400">
                      {appr.resolved_at ? new Date(appr.resolved_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-purple-300 font-bold">{appr.tool}</td>
                    <td className="py-3 px-4 text-slate-300 font-sans">{appr.agent_id}</td>
                    <td className="py-3 px-4 font-sans">
                      <span
                        className={`font-bold px-2 py-0.5 rounded uppercase text-[10px] ${
                          appr.status === 'approved'
                            ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                            : appr.status === 'denied'
                            ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                            : 'text-slate-400 bg-slate-800'
                        }`}
                      >
                        {appr.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-cyan-300">{appr.reviewer || 'system'}</td>
                    <td className="py-3 px-4 text-slate-400 font-sans">{appr.note || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    No resolved approvals in historical ledger yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Decision Note Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white capitalize">
              {actionModal.type === 'approve' ? 'Approve Tool Execution' : 'Deny Escalated Action'}
            </h3>

            <p className="text-xs text-slate-400">
              {actionModal.type === 'approve'
                ? 'Approving will immediately trigger the underlying operational adapter and record human authorization in the audit chain.'
                : 'Denying will permanently cancel execution and record supervisor rejection in the audit ledger.'}
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Reviewer Identity
              </label>
              <input
                type="text"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Decision Note & Justification
              </label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="e.g. Authorized customer invoice balance adjustment under SLA clause 4."
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setActionModal(null)}
                disabled={processing}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>

              <button
                onClick={actionModal.type === 'approve' ? handleApprove : handleDeny}
                disabled={processing}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-slate-950 transition ${
                  actionModal.type === 'approve'
                    ? 'bg-emerald-500 hover:bg-emerald-400'
                    : 'bg-rose-500 hover:bg-rose-400 text-white'
                }`}
              >
                {processing ? 'Processing...' : actionModal.type === 'approve' ? 'Confirm Approval' : 'Confirm Denial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
