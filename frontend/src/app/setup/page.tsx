'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/hooks/useSession';
import { useWebSocket, WSMessage } from '@/hooks/useWebSocket';

export default function SetupPage() {
  const { session, wsUrl, revokeAgent, createSession } = useSession();
  const [agentConnected, setAgentConnected] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'windows' | 'mac' | 'linux'>('windows');
  const [codeExpired, setCodeExpired] = useState(false);

  const onMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'agent_status') {
      setAgentConnected(msg.status === 'connected');
      setAgentId((msg.agentId as string) || null);
    }
  }, []);

  const { connectionState } = useWebSocket({
    url: wsUrl,
    sessionId: session?.sessionId || null,
    onMessage,
  });

  // Check if code is expired
  useEffect(() => {
    if (!session?.expiresAt) return;
    const check = () => {
      setCodeExpired(Date.now() > session.expiresAt);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [session?.expiresAt]);

  const handleRefreshCode = async () => {
    await createSession();
    setCodeExpired(false);
  };

  return (
    <div className="section animate-in">
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          <span style={{ background: 'var(--gradient-hero)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Agent Setup
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Connect the Python Network Agent to start measuring jitter
        </p>
      </div>

      {/* Agent Status */}
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span className={`status-dot ${agentConnected ? 'connected' : 'disconnected'}`}
                style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            Agent Status: {agentConnected ? '🟢 Connected' : '🔴 Not Connected'}
          </span>
        </div>
        {agentConnected && agentId && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Agent ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{agentId.slice(0, 8)}...</code>
          </p>
        )}
        {agentConnected && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--accent-green)', fontWeight: 600, marginBottom: '0.5rem' }}>
              ✓ Your agent is paired. Future startups will connect automatically — no code needed.
            </p>
            <button className="btn btn-ghost" onClick={revokeAgent} style={{ marginTop: '0.5rem' }}>
              Revoke & Re-pair Agent
            </button>
          </div>
        )}
      </div>

      {/* Pairing Flow (show only if not connected) */}
      {!agentConnected && (
        <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', textAlign: 'center' }}>
            First-Time Pairing
          </h2>

          <div className="setup-steps">
            {/* Step 1: Get the code */}
            <div className="setup-step">
              <div className="step-number">1</div>
              <div className="step-content" style={{ flex: 1 }}>
                <h3>Your Pairing Code</h3>
                <p>Share this code with the Python Agent to pair it with your browser session.</p>
                <div style={{ marginTop: '1rem' }}>
                  {session?.pairingCode && !codeExpired ? (
                    <div className="pairing-code">{session.pairingCode}</div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: 'var(--accent-amber)', marginBottom: '0.75rem' }}>
                        {codeExpired ? '⏰ Code expired' : 'Generating code...'}
                      </p>
                      <button className="btn btn-primary" onClick={handleRefreshCode}>
                        🔄 Get New Code
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2: Download */}
            <div className="setup-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Download the Network Agent</h3>
                <p>Get the Python agent source or the Windows executable.</p>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  <a href="https://github.com/YOUR_REPO/releases/latest" target="_blank" rel="noopener noreferrer"
                     className="btn btn-primary btn-lg">
                    ⬇️ Download for Windows (.exe)
                  </a>
                  <a href="https://github.com/YOUR_REPO" target="_blank" rel="noopener noreferrer"
                     className="btn btn-ghost">
                    📦 Source Code
                  </a>
                </div>
              </div>
            </div>

            {/* Step 3: Run */}
            <div className="setup-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Run the Agent</h3>
                <p>Start the agent with your pairing code:</p>

                <div className="tabs" style={{ marginTop: '0.75rem' }}>
                  <div className={`tab ${activeTab === 'windows' ? 'active' : ''}`} onClick={() => setActiveTab('windows')}>Windows</div>
                  <div className={`tab ${activeTab === 'mac' ? 'active' : ''}`} onClick={() => setActiveTab('mac')}>macOS</div>
                  <div className={`tab ${activeTab === 'linux' ? 'active' : ''}`} onClick={() => setActiveTab('linux')}>Linux</div>
                </div>

                {activeTab === 'windows' && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Option A: Python source</p>
                    <code>cd agent</code><br />
                    <code>pip install -r requirements.txt</code><br />
                    <code>python network_agent.py --code {session?.pairingCode || 'XXXXXX'}</code>
                    <br /><br />
                    <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Option B: Executable</p>
                    <code>NetworkJitterAgent.exe --code {session?.pairingCode || 'XXXXXX'}</code>
                  </div>
                )}
                {activeTab === 'mac' && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                    <code>cd agent</code><br />
                    <code>pip3 install -r requirements.txt</code><br />
                    <code>python3 network_agent.py --code {session?.pairingCode || 'XXXXXX'}</code>
                  </div>
                )}
                {activeTab === 'linux' && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                    <code>cd agent</code><br />
                    <code>pip install -r requirements.txt</code><br />
                    <code>python3 network_agent.py --code {session?.pairingCode || 'XXXXXX'}</code>
                  </div>
                )}
              </div>
            </div>

            {/* Step 4: Verify */}
            <div className="setup-step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h3>Return Here</h3>
                <p>Once the agent connects, this page will show <strong style={{ color: 'var(--accent-green)' }}>🟢 Connected</strong>. Then go to the Dashboard and click <strong>Start Test</strong>.</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  After first-time pairing, just start the agent normally — it connects automatically. No code needed again.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Troubleshooting */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>🔧 Troubleshooting</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
          <TroubleshootItem
            problem="Agent says 'Connection refused'"
            solution="Make sure the backend server is running: cd backend && npm start"
          />
          <TroubleshootItem
            problem="Agent says 'Invalid or expired pairing code'"
            solution="Click 'Get New Code' above to generate a fresh code. Codes expire after 5 minutes."
          />
          <TroubleshootItem
            problem="Agent says 'Invalid or revoked agent token'"
            solution="Run the agent with --reset flag to delete old credentials and pair again."
          />
          <TroubleshootItem
            problem="Agent connects but dashboard doesn't show it"
            solution="Make sure the backend CORS_ORIGIN matches your frontend URL. Check browser console for WebSocket errors."
          />
          <TroubleshootItem
            problem="'No module named websockets' error"
            solution="Install dependencies: pip install -r requirements.txt"
          />
        </div>
      </div>
    </div>
  );
}

function TroubleshootItem({ problem, solution }: { problem: string; solution: string }) {
  return (
    <div style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-blue)' }}>
      <strong style={{ color: 'var(--accent-amber)' }}>{problem}</strong>
      <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{solution}</p>
    </div>
  );
}
