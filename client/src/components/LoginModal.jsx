import React, { useState } from 'react';
import { Shield, Key, AlertCircle } from 'lucide-react';
import { getAdminToken, setAdminToken } from '../api';

export function LoginModal({ isOpen, onClose, onLoggedIn }) {
  const [tokenInput, setTokenInput] = useState(getAdminToken() || '');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError('Please provide a valid administrator security token.');
      return;
    }
    setAdminToken(tokenInput.trim());
    setError('');
    if (onLoggedIn) onLoggedIn(tokenInput.trim());
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">AgentGuard Access</h2>
            <p className="text-sm text-slate-400">Security Gateway Administrator Console</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Admin Bearer Token
            </label>
            <div className="relative">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="e.g. admin-secret-token-123"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 pl-10 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
              />
              <Key className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Default development token: <code className="text-cyan-400 font-mono bg-slate-800 px-1 py-0.5 rounded">admin-secret-token-123</code>
            </p>
          </div>

          {error && (
            <div className="flex items-center space-x-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="submit"
              className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
            >
              Authenticate & Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
