import React, { useState, useEffect } from 'react';
import { Radio, Search, Filter, CheckCircle2, AlertOctagon, HelpCircle, ArrowUpDown, RefreshCw } from 'lucide-react';
import { api } from '../api';

export function LiveFeed({ onSelectAction, feedUpdates }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [agentFilter, setAgentFilter] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchActions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getActions({
        agent: agentFilter,
        decision: decisionFilter,
        search: searchQuery,
        limit: 100
      });
      setActions(res.actions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();
  }, [agentFilter, decisionFilter]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchActions();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // When a new action arrives over WebSocket, prepend it to the feed
  useEffect(() => {
    if (feedUpdates && feedUpdates.type === 'action' && feedUpdates.data) {
      const newAct = feedUpdates.data;
      setActions((prev) => {
        // Avoid duplicate if already exists
        const exists = prev.some((a) => a.id === newAct.id);
        if (exists) {
          return prev.map((a) => (a.id === newAct.id ? { ...a, ...newAct } : a));
        }
        return [newAct, ...prev];
      });
    }
  }, [feedUpdates]);

  const renderBadge = (decision) => {
    switch (decision) {
      case 'ALLOW':
        return (
          <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            <span>ALLOW</span>
          </span>
        );
      case 'BLOCK':
        return (
          <span className="inline-flex items-center space-x-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[11px] font-bold text-rose-400">
            <AlertOctagon className="h-3 w-3" />
            <span>BLOCK</span>
          </span>
        );
      case 'ESCALATE':
        return (
          <span className="inline-flex items-center space-x-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
            <HelpCircle className="h-3 w-3" />
            <span>ESCALATE</span>
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{decision}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by action ID, tool, args, context..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 pl-9 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
        </div>

        <div className="flex items-center space-x-2">
          {/* Decision filter */}
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Decisions</option>
            <option value="ALLOW">ALLOW</option>
            <option value="BLOCK">BLOCK</option>
            <option value="ESCALATE">ESCALATE</option>
          </select>

          {/* Agent filter */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Agents</option>
            <option value="support-agent">support-agent</option>
            <option value="finance-agent">finance-agent</option>
            <option value="ops-agent">ops-agent</option>
          </select>

          <button
            onClick={fetchActions}
            className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-400 hover:text-white transition"
            title="Refresh feed"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Real-Time Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action ID</th>
                <th className="py-3 px-4">Agent</th>
                <th className="py-3 px-4">Tool</th>
                <th className="py-3 px-4">Decision</th>
                <th className="py-3 px-4">Risk</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Audit Seq</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {actions.length > 0 ? (
                actions.map((act) => (
                  <tr
                    key={act.id}
                    onClick={() => onSelectAction(act)}
                    className="hover:bg-slate-800/50 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(act.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-cyan-400 font-bold whitespace-nowrap">
                      {act.id}
                    </td>
                    <td className="py-3 px-4 text-slate-200 whitespace-nowrap font-sans font-medium">
                      {act.agent_id}
                    </td>
                    <td className="py-3 px-4 text-purple-300 whitespace-nowrap">
                      {act.tool}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-sans">
                      {renderBadge(act.decision)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded ${
                          act.risk_score > 60
                            ? 'text-rose-400 bg-rose-500/10'
                            : act.risk_score > 30
                            ? 'text-amber-400 bg-amber-500/10'
                            : 'text-emerald-400 bg-emerald-500/10'
                        }`}
                      >
                        {act.risk_score}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-sans text-slate-300 capitalize">
                      {act.status}
                    </td>
                    <td className="py-3 px-4 text-right text-purple-400 whitespace-nowrap font-bold">
                      {act.audit_seq ? `#${act.audit_seq}` : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                    {loading ? 'Fetching intercepted events...' : 'No matching gateway actions found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
