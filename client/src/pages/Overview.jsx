import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertOctagon,
  FileCheck2,
  Bot,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { api } from '../api';

export function Overview({ setActiveTab, onSelectAction }) {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sData, aData] = await Promise.all([
        api.getStats(),
        api.getAlerts()
      ]);
      setStats(sData);
      setAlerts(aData.alerts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 10000); // Polling fallback alongside WS
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex items-center space-x-3 text-cyan-400">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="text-sm font-medium">Loading Gateway Security Telemetry...</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <h3 className="text-base font-bold text-white mb-1">Failed to Load Gateway Statistics</h3>
          <p className="text-xs">{error}</p>
          <button
            onClick={fetchOverview}
            className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Actions Intercepted',
      value: stats?.totalActions ?? 0,
      sub: `${stats?.allowedActions ?? 0} authorized (ALLOW)`,
      icon: TrendingUp,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10 border-cyan-500/20'
    },
    {
      title: 'Interception Block Rate',
      value: `${stats?.blockRate ?? 0}%`,
      sub: `${stats?.blockedActions ?? 0} blocked attacks / violations`,
      icon: AlertOctagon,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10 border-rose-500/20'
    },
    {
      title: 'Pending Human Approvals',
      value: stats?.pendingApprovals ?? 0,
      sub: 'Escalated grey-zone actions awaiting review',
      icon: FileCheck2,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      clickable: true,
      tab: 'approvals'
    },
    {
      title: 'Unacknowledged Security Alerts',
      value: stats?.activeAlerts ?? 0,
      sub: 'Injection & anomaly detections',
      icon: AlertTriangle,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10 border-purple-500/20',
      clickable: true,
      tab: 'alerts'
    }
  ];

  const criticalAlerts = alerts.filter((a) => a.acknowledged === 0 && (a.severity === 'critical' || a.severity === 'high')).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              onClick={() => card.clickable && setActiveTab(card.tab)}
              className={`rounded-2xl border p-5 transition-all ${card.bgColor} ${
                card.clickable ? 'cursor-pointer hover:scale-[1.02]' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {card.title}
                </span>
                <div className={`p-2 rounded-xl bg-slate-950/60 ${card.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-white font-mono tracking-tight">
                {card.value}
              </div>
              <p className="mt-1 text-xs text-slate-400">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Agents Fleet Status Overview */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Agent Fleet Posture</h3>
          </div>
          <button
            onClick={() => setActiveTab('agents')}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
          >
            <span>Manage Fleet</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
            <div className="flex items-center space-x-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-200">Active Agents</span>
            </div>
            <span className="text-lg font-bold text-white font-mono">{stats?.agents?.active ?? 0}</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5">
            <div className="flex items-center space-x-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-xs font-semibold text-amber-200">Paused Agents</span>
            </div>
            <span className="text-lg font-bold text-white font-mono">{stats?.agents?.paused ?? 0}</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5">
            <div className="flex items-center space-x-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="text-xs font-semibold text-rose-200">Killed Agents</span>
            </div>
            <span className="text-lg font-bold text-white font-mono">{stats?.agents?.killed ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Main Graph: Actions Over Time Timeline */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Gateway Interception Velocity</h3>
            <p className="text-xs text-slate-400">Real-time actions per minute categorized by decision</p>
          </div>
          <div className="flex items-center space-x-4 text-xs font-semibold">
            <div className="flex items-center space-x-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Allow</span>
            </div>
            <div className="flex items-center space-x-1.5 text-rose-400">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              <span>Block</span>
            </div>
            <div className="flex items-center space-x-1.5 text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>Escalate</span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          {stats?.timeline && stats.timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAllow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorBlock" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorEscalate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="minute"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(val) => val.split('T')[1] || val}
                />
                <YAxis stroke="#64748b" fontSize={10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#cbd5e1', fontSize: '11px', fontFamily: 'monospace' }}
                />
                <Area type="monotone" dataKey="allowed" stroke="#10b981" fillOpacity={1} fill="url(#colorAllow)" />
                <Area type="monotone" dataKey="blocked" stroke="#f43f5e" fillOpacity={1} fill="url(#colorBlock)" />
                <Area type="monotone" dataKey="escalated" stroke="#f59e0b" fillOpacity={1} fill="url(#colorEscalate)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              No telemetry actions recorded yet. Trigger a scenario from the top bar!
            </div>
          )}
        </div>
      </div>

      {/* Critical Alerts Feed */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="h-5 w-5 text-rose-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Active Security Alerts</h3>
          </div>
          <button
            onClick={() => setActiveTab('alerts')}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
          >
            <span>View All Alerts</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {criticalAlerts.length > 0 ? (
          <div className="space-y-2.5">
            {criticalAlerts.map((alt) => (
              <div
                key={alt.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs hover:border-slate-700 transition"
              >
                <div className="flex items-center space-x-3">
                  <span
                    className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${
                      alt.severity === 'critical'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {alt.severity}
                  </span>
                  <div>
                    <span className="font-semibold text-slate-100">{alt.message}</span>
                    <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-0.5">
                      <span>Agent: <strong className="text-cyan-300 font-mono">{alt.agent_id}</strong></span>
                      <span>Type: <strong className="text-slate-300">{alt.type}</strong></span>
                      <span>{new Date(alt.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setActiveTab('alerts')}
                    className="rounded bg-slate-800 px-3 py-1 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
                  >
                    Investigate
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2 opacity-80" />
            <p className="font-semibold text-slate-300">All Security Systems Normal</p>
            <p className="text-slate-500">No unacknowledged critical or high severity security alerts.</p>
          </div>
        )}
      </div>
    </div>
  );
}
