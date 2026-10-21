import React, { useState, useEffect } from 'react';
import {
  Shield,
  Activity,
  Radio,
  FileCheck2,
  Bot,
  AlertTriangle,
  History,
  FileCode2,
  Play,
  Key,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  HeartPulse
} from 'lucide-react';
import { api } from '../api';

export function Navbar({
  activeTab,
  setActiveTab,
  connected,
  pendingApprovalsCount = 0,
  activeAlertsCount = 0,
  onOpenLogin
}) {
  const [runningScenario, setRunningScenario] = useState(null);
  const [scenarioStatus, setScenarioStatus] = useState('');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const h = await api.getHealth();
        setHealth(h);
      } catch {
        setHealth(null);
      }
    };
    checkHealth();
    const timer = setInterval(checkHealth, 15000);
    return () => clearInterval(timer);
  }, []);

  const triggerReset = async () => {
    if (!window.confirm('Reset all demo state? This will revive killed/paused agents, clear alerts, and restore fresh baseline ledger.')) return;
    try {
      setRunningScenario('reset');
      setScenarioStatus('Resetting demo baseline...');
      await api.resetDemo();
      setScenarioStatus('Demo reset complete!');
      setTimeout(() => {
        setScenarioStatus('');
        window.location.reload();
      }, 1000);
    } catch (err) {
      setScenarioStatus(`Reset failed: ${err.message}`);
      setTimeout(() => setScenarioStatus(''), 4000);
    } finally {
      setRunningScenario(null);
    }
  };

  const triggerScenario = async (name) => {
    try {
      setRunningScenario(name);
      setScenarioStatus(`Running '${name}'...`);
      const res = await api.runDemo(name);
      setScenarioStatus(`Completed '${name}'`);
      setTimeout(() => setScenarioStatus(''), 3500);
    } catch (err) {
      setScenarioStatus(`Failed: ${err.message}`);
      setTimeout(() => setScenarioStatus(''), 4000);
    } finally {
      setRunningScenario(null);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'feed', label: 'Live Feed', icon: Radio },
    { id: 'approvals', label: 'Approvals', icon: FileCheck2, badge: pendingApprovalsCount },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: activeAlertsCount, badgeColor: 'bg-rose-500' },
    { id: 'audit', label: 'Audit Chain', icon: History },
    { id: 'policies', label: 'Policies', icon: FileCode2 }
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      {/* Top Banner: Status & 1-Click Live Scenarios */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-900/60 text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="font-medium text-slate-300">
              {connected ? 'Gateway Live (ws/feed)' : 'Gateway Reconnecting...'}
            </span>
          </div>

          {health && (
            <div className="hidden lg:flex items-center space-x-1.5 text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
              <HeartPulse className="h-3 w-3 text-emerald-400" />
              <span>Health: {health.status}</span>
              <span className="text-slate-400">({health.agents} agents)</span>
            </div>
          )}

          <div className="hidden md:block h-3 w-px bg-slate-800" />

          {scenarioStatus && (
            <div className="flex items-center space-x-1.5 text-cyan-400 font-mono animate-fade-in">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>{scenarioStatus}</span>
            </div>
          )}
        </div>

        {/* 1-Click Scenario Demo Toolbar */}
        <div className="flex items-center space-x-1.5">
          <span className="hidden sm:inline text-slate-400 font-semibold mr-1">Demo Scenarios:</span>
          
          <button
            onClick={() => triggerScenario('normal')}
            disabled={runningScenario != null}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium transition disabled:opacity-50"
            title="Execute normal authorized workflow (ALLOW)"
          >
            <Play className="h-3 w-3" />
            <span>Normal</span>
          </button>

          <button
            onClick={() => triggerScenario('injection')}
            disabled={runningScenario != null}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-400 font-medium transition disabled:opacity-50"
            title="Execute prompt injection exfiltration attack (BLOCK)"
          >
            <Play className="h-3 w-3" />
            <span>Injection</span>
          </button>

          <button
            onClick={() => triggerScenario('refund')}
            disabled={runningScenario != null}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-medium transition disabled:opacity-50"
            title="Trigger high-value refund requiring human sign-off (ESCALATE)"
          >
            <Play className="h-3 w-3" />
            <span>Refund</span>
          </button>

          <button
            onClick={() => triggerScenario('burst')}
            disabled={runningScenario != null}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-400 font-medium transition disabled:opacity-50"
            title="Trigger velocity burst and automatic agent pause"
          >
            <Play className="h-3 w-3" />
            <span>Burst</span>
          </button>

          <button
            onClick={() => triggerScenario('tamper')}
            disabled={runningScenario != null}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-red-400 font-medium transition disabled:opacity-50"
            title="Alters SQLite database directly to test cryptographic verification"
          >
            <Play className="h-3 w-3" />
            <span>Tamper</span>
          </button>

          <div className="h-3 w-px bg-slate-700 mx-1" />

          <button
            onClick={triggerReset}
            disabled={runningScenario != null}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800/80 text-rose-300 font-semibold transition disabled:opacity-50"
            title="Reset all demo state, revive agents, clear alerts, fresh baseline"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-white text-lg tracking-tight">AgentGuard</span>
              <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-cyan-300">
                GATEWAY
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-none">AI Agent Safety & Interception</p>
          </div>
        </div>

        {/* Tab navigation links */}
        <nav className="flex items-center space-x-1 overflow-x-auto py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center space-x-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm shadow-slate-900 border border-slate-700'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span
                    className={`ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                      item.badgeColor || 'bg-amber-500'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Token / Auth settings */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenLogin}
            className="flex items-center space-x-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title="Configure Admin Bearer Token"
          >
            <Key className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Admin Token</span>
          </button>
        </div>
      </div>
    </header>
  );
}
