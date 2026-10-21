import React, { useState, useEffect } from 'react';
import { FileCode2, Save, RefreshCw, CheckCircle2, AlertOctagon, Shield, Sliders } from 'lucide-react';
import { api } from '../api';

export function Policies() {
  const [policyJson, setPolicyJson] = useState('');
  const [parsedPolicy, setParsedPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [syntaxError, setSyntaxError] = useState(null);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      const res = await api.getPolicies();
      const formatted = JSON.stringify(res.policies, null, 2);
      setPolicyJson(formatted);
      setParsedPolicy(res.policies);
      setSyntaxError(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to load policies: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicy();
  }, []);

  const handleJsonChange = (e) => {
    const text = e.target.value;
    setPolicyJson(text);
    try {
      const parsed = JSON.parse(text);
      setParsedPolicy(parsed);
      setSyntaxError(null);
    } catch (err) {
      setSyntaxError(err.message);
    }
  };

  const handleSave = async () => {
    if (syntaxError) return;
    try {
      setSaving(true);
      setStatusMessage(null);
      const parsed = JSON.parse(policyJson);
      const res = await api.updatePolicies(parsed);
      setStatusMessage({ type: 'success', text: 'Policies successfully saved and hot-reloaded into gateway pipeline!' });
      setParsedPolicy(res.policies);
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Policy update rejected: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(policyJson);
      setPolicyJson(JSON.stringify(parsed, null, 2));
      setSyntaxError(null);
    } catch (err) {
      setSyntaxError('Cannot format: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Active Policy Engine Configuration</h2>
          <p className="text-xs text-slate-400">
            Declarative deterministic safety rules, allowlists, and execution velocity ceilings
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleFormat}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            Prettify JSON
          </button>

          <button
            onClick={handleSave}
            disabled={saving || Boolean(syntaxError)}
            className="flex items-center space-x-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Save & Hot-Reload</span>
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {statusMessage && (
        <div
          className={`rounded-2xl border p-4 text-xs animate-fade-in ${
            statusMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertOctagon className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Agent Policies Overview Summary Cards */}
      {parsedPolicy?.agents && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(parsedPolicy.agents).map(([agentId, config]) => (
            <div key={agentId} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-mono text-cyan-300 font-bold text-xs">{agentId}</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {config.role}
                </span>
              </div>

              <div className="text-xs space-y-1.5">
                <div className="text-slate-400">
                  <span>Allowed Tools: </span>
                  <span className="font-mono text-purple-300 font-bold">
                    {config.allowed_tools?.length ?? 0}
                  </span>
                </div>
                <div className="text-slate-400">
                  <span>Safety Rules: </span>
                  <span className="font-mono text-amber-300 font-bold">
                    {config.rules?.length ?? 0}
                  </span>
                </div>
                <div className="text-slate-400">
                  <span>Rate Limit: </span>
                  <span className="font-mono text-emerald-300 font-bold">
                    {config.limits?.max_actions_per_minute ?? 30} / min
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Interactive JSON Policy Editor */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Sliders className="h-4 w-4 text-cyan-400" />
            <span>Policy JSON Document</span>
          </div>
          {syntaxError ? (
            <span className="text-xs font-mono text-rose-400">Syntax Error: {syntaxError}</span>
          ) : (
            <span className="text-xs font-mono text-emerald-400">Valid JSON Syntax</span>
          )}
        </div>

        <textarea
          value={policyJson}
          onChange={handleJsonChange}
          rows={22}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none leading-relaxed"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
