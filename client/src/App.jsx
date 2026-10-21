import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { ActionDrawer } from './components/ActionDrawer';
import { Overview } from './pages/Overview';
import { LiveFeed } from './pages/LiveFeed';
import { Approvals } from './pages/Approvals';
import { Agents } from './pages/Agents';
import { Alerts } from './pages/Alerts';
import { Audit } from './pages/Audit';
import { Policies } from './pages/Policies';
import { useFeed } from './useFeed';
import { api, getAdminToken } from './api';

export function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAction, setSelectedAction] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Badge counters
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);

  // WebSocket real-time subscription
  const { connected, lastMessage } = useFeed();

  // Toast notification state
  const [toast, setToast] = useState(null);

  // Initial stats fetch to populate badges
  const refreshBadges = async () => {
    try {
      const stats = await api.getStats();
      setPendingApprovalsCount(stats.pendingApprovals || 0);
      setActiveAlertsCount(stats.activeAlerts || 0);
    } catch (err) {
      // If unauthorized, prompt login modal
      if (err.message.includes('Unauthorized')) {
        setIsLoginOpen(true);
      }
    }
  };

  useEffect(() => {
    refreshBadges();

    const handleUnauthorized = () => setIsLoginOpen(true);
    window.addEventListener('agentguard:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('agentguard:unauthorized', handleUnauthorized);
  }, []);

  // Listen for real-time WebSocket events
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'action') {
      const act = lastMessage.data;
      if (act.decision === 'ESCALATE') {
        setPendingApprovalsCount((prev) => prev + 1);
        setToast({
          title: 'Approval Required',
          message: `Agent '${act.agent_id}' invoked escalated tool '${act.tool}'`,
          type: 'escalate'
        });
      }
    } else if (lastMessage.type === 'approval') {
      refreshBadges();
    } else if (lastMessage.type === 'alert') {
      const alt = lastMessage.data;
      if (alt.acknowledged === 0) {
        setActiveAlertsCount((prev) => prev + 1);
        setToast({
          title: `Security Alert (${alt.severity.toUpperCase()})`,
          message: alt.message,
          type: 'alert'
        });
      }
    }
  }, [lastMessage]);

  // Clear toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        connected={connected}
        pendingApprovalsCount={pendingApprovalsCount}
        activeAlertsCount={activeAlertsCount}
        onOpenLogin={() => setIsLoginOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'overview' && (
          <Overview
            setActiveTab={setActiveTab}
            onSelectAction={setSelectedAction}
          />
        )}

        {activeTab === 'feed' && (
          <LiveFeed
            onSelectAction={setSelectedAction}
            feedUpdates={lastMessage}
          />
        )}

        {activeTab === 'approvals' && (
          <Approvals
            feedUpdates={lastMessage}
            onSelectAction={setSelectedAction}
          />
        )}

        {activeTab === 'agents' && (
          <Agents
            feedUpdates={lastMessage}
          />
        )}

        {activeTab === 'alerts' && (
          <Alerts
            onSelectAction={setSelectedAction}
            feedUpdates={lastMessage}
          />
        )}

        {activeTab === 'audit' && (
          <Audit />
        )}

        {activeTab === 'policies' && (
          <Policies />
        )}
      </main>

      {/* Action Details Slide-Over Drawer */}
      <ActionDrawer
        action={selectedAction}
        onClose={() => setSelectedAction(null)}
      />

      {/* Admin Login Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoggedIn={() => refreshBadges()}
      />

      {/* Real-Time Alert Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md animate-slide-up max-w-md">
          <div
            className={`h-3 w-3 rounded-full shrink-0 ${
              toast.type === 'escalate' ? 'bg-amber-400 animate-ping' : 'bg-rose-500 animate-ping'
            }`}
          />
          <div className="text-xs">
            <h5 className="font-bold text-white">{toast.title}</h5>
            <p className="text-slate-300 mt-0.5">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white text-xs ml-auto font-bold pl-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
