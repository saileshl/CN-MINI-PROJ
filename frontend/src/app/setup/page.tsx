'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import Link from 'next/link';

export default function SetupPage() {
  const { session, status: sessionStatus, agentConnected, agentId, backendOnline, revokeAgent, createSession } = useSession();
  const [activeTab, setActiveTab] = useState<'windows' | 'mac' | 'linux'>('windows');
  const [codeExpired, setCodeExpired] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check code expiry
  useEffect(() => {
    if (!session?.expiresAt) return;
    const check = () => setCodeExpired(Date.now() > session.expiresAt);
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [session?.expiresAt]);

  const handleRefreshCode = async () => {
    await createSession();
    setCodeExpired(false);
  };

  const isPaired = sessionStatus?.paired || (agentConnected && !!agentId);

  return (
    <div className="section animate-in">
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          <span style={{ background: 'var(--gradient-hero)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Agent Setup
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Connect the Python Network Agent to start measuring real network jitter
        </p>
      </div>

      {/* Backend Status Banner */}
      {backendOnline === false && (
        <div className="experiment-banner" style={{ marginBottom: '2rem', borderColor: 'rgba(245, 158, 11, 0.3)', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)' }}>
          <span style={{ fontSize: '1.5rem' }}>🎮</span>
          <div>
            <strong style={{ color: 'var(--accent-amber)' }}>Backend Not Running — Demo Mode Available</strong>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
              The pairing system requires the backend server running locally. You can still explore the{' '}
              <Link href="/" style={{ color: 'var(--accent-cyan)' }}>Dashboard in Demo Mode</Link> with simulated data.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              To run live: <code style={{ color: 'var(--accent-cyan)' }}>cd backend && npm install && npm start</code>
            </p>
          </div>
        </div>
      )}

      {/* Agent Status */}
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span className={`status-dot ${agentConnected ? 'connected' : isPaired ? 'connecting' : backendOnline ? 'disconnected' : 'connecting'}`}
                style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            {backendOnline === false
              ? 'Backend: Offline'
              : agentConnected
                ? '🟢 Agent Connected & Active'
                : isPaired
                  ? '🟡 Agent Paired (Process Offline)'
                  : '🔴 Agent Not Connected'
            }
          </span>
        </div>
        {agentId && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Agent ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{agentId.slice(0, 8)}...</code>
          </p>
        )}
        {agentConnected ? (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--accent-green)', fontWeight: 600, marginBottom: '0.5rem' }}>
              ✓ Your agent is actively connected and ready to run tests!
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.75rem' }}>
              <Link href="/" className="btn btn-primary">
                ⚡ Go to Dashboard
              </Link>
              <button className="btn btn-ghost" onClick={revokeAgent}>
                Revoke & Re-pair
              </button>
            </div>
          </div>
        ) : isPaired ? (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--accent-amber)', fontWeight: 600, marginBottom: '0.25rem' }}>
              Agent credentials exist, but the Python agent is not currently running.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Start the agent in your terminal: <code style={{ color: 'var(--accent-cyan)' }}>python network_agent.py</code> (no code needed).
            </p>
            <button className="btn btn-ghost" onClick={handleRefreshCode} style={{ marginTop: '0.75rem' }}>
              🔄 Reset & Generate New Pairing Code
            </button>
          </div>
        ) : null}
      </div>

      {/* All-in-One Quick Start */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid rgba(99, 102, 241, 0.4)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(34, 211, 238, 0.05) 100%)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>⚡</span> Single Command Quick Start (All-in-One)
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Run the full stack (Node.js Backend + Next.js Frontend + UDP Server) simultaneously with a single command from the project root:
        </p>

        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)', padding: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-cyan)', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}># In the root directory (CN-MINI-PROJ):</p>
          <code style={{ fontSize: '1rem', fontWeight: 700, color: '#22d3ee' }}>npm start</code>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem', marginBottom: '0.25rem' }}>Or on Windows, simply double-click:</p>
          <code style={{ color: '#a78bfa' }}>start.bat</code>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          💡 This automatically launches the WebSocket relay, UDP test server (port 5005), and dashboard (port 3000) all together.
        </p>
      </div>

      {/* How It Works */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', textAlign: 'center' }}>
          Step-by-Step Setup Guide
        </h2>

        <div className="setup-steps">
          {/* Step 1 */}
          <div className="setup-step">
            <div className="step-number">1</div>
            <div className="step-content" style={{ flex: 1 }}>
              <h3>Start All Services</h3>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '0.5rem' }}>
                <code>npm start</code>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Starts the backend server (port 4000), UDP echo server (port 5005), and frontend (port 3000).
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="setup-step">
            <div className="step-number">3</div>
            <div className="step-content" style={{ flex: 1 }}>
              <h3>Get a Pairing Code</h3>
              {mounted && backendOnline && session?.pairingCode && !codeExpired ? (
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Your pairing code (valid for 5 minutes):
                  </p>
                  <div className="pairing-code" suppressHydrationWarning>{session.pairingCode}</div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }} suppressHydrationWarning>
                    {!mounted || backendOnline === null
                      ? 'Loading pairing code...'
                      : backendOnline === false
                        ? 'Start the backend server first, then open http://localhost:3000/setup to get a pairing code.'
                        : codeExpired
                          ? '⏰ Code expired.'
                          : 'Waiting for backend connection...'}
                  </p>
                  {backendOnline && (
                    <button className="btn btn-primary" onClick={handleRefreshCode} style={{ marginTop: '0.5rem' }}>
                      🔄 Get New Code
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 4 */}
          <div className="setup-step">
            <div className="step-number">4</div>
            <div className="step-content">
              <h3>Run the Python Agent</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Requires Python 3.10+. First time only — enter your pairing code:
              </p>

              <div className="tabs" style={{ marginTop: '0.5rem' }}>
                <div className={`tab ${activeTab === 'windows' ? 'active' : ''}`} onClick={() => setActiveTab('windows')}>Windows</div>
                <div className={`tab ${activeTab === 'mac' ? 'active' : ''}`} onClick={() => setActiveTab('mac')}>macOS</div>
                <div className={`tab ${activeTab === 'linux' ? 'active' : ''}`} onClick={() => setActiveTab('linux')}>Linux</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                <code>cd agent</code><br />
                <code>{activeTab === 'mac' ? 'pip3' : 'pip'} install -r requirements.txt</code><br />
                <code suppressHydrationWarning>{activeTab === 'windows' ? 'python' : 'python3'} network_agent.py --code {mounted ? (session?.pairingCode || 'XXXXXX') : 'XXXXXX'}</code>
                <br /><br />
                <p style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>After first pairing (no code needed):</p>
                <code>{activeTab === 'windows' ? 'python' : 'python3'} network_agent.py</code>
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className="setup-step">
            <div className="step-number">5</div>
            <div className="step-content">
              <h3>Go to Dashboard</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Once the agent connects, go to the <Link href="/" style={{ color: 'var(--accent-cyan)' }}>Dashboard</Link> and click <strong>Start Test</strong>.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                After first-time pairing, just start the agent — it connects automatically. No code needed again.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Mode Card */}
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          🎮 Just Want to See It Work?
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          The Dashboard has a built-in Demo Mode that runs simulated measurements with realistic jitter data.
          No setup needed — works right in your browser.
        </p>
        <Link href="/" className="btn btn-success btn-lg">
          ⚡ Open Dashboard (Demo Mode)
        </Link>
      </div>

      {/* Architecture */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>🏗️ Architecture</h2>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 2, color: 'var(--accent-cyan)', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <div>🌐 <strong>Next.js Frontend</strong> (this site — Vercel)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ WebSocket</div>
          <div>⚡ <strong>Node.js Backend</strong> (your machine — port 4000)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ WebSocket</div>
          <div>🐍 <strong>Python Agent</strong> (your machine — measures jitter)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ UDP packets</div>
          <div>📡 <strong>UDP Test Server</strong> (your machine — port 5005)</div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
          The backend requires WebSockets + UDP, which can&apos;t run on serverless platforms like Vercel.
          It runs on your local machine or a persistent host (Railway/Render).
        </p>
      </div>

      {/* Source Code */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>📦 Source Code</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Full source code with backend, Python agent, tests, and documentation:
        </p>
        <a href="https://github.com/saileshl/CN-MINI-PROJ" target="_blank" rel="noopener noreferrer"
           className="btn btn-primary btn-lg">
          🔗 View on GitHub
        </a>
      </div>
    </div>
  );
}
