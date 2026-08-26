'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/hooks/useSession';
import Link from 'next/link';

export default function SetupPage() {
  const {
    session,
    status: sessionStatus,
    agentConnected,
    agentId,
    backendOnline,
    revokeAgent,
    createSession,
    backendUrl,
    setBackendUrl,
    isVercel,
  } = useSession();

  const [activeTab, setActiveTab] = useState<'windows' | 'mac' | 'linux'>('windows');
  const [codeExpired, setCodeExpired] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedNpm, setCopiedNpm] = useState(false);
  const [customBackend, setCustomBackend] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCustomBackend(backendUrl);
  }, [backendUrl]);

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

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isPaired = sessionStatus?.paired || (agentConnected && !!agentId);
  const currentPairingCode = session?.pairingCode || '9VDCLT';
  const agentCommand = `${activeTab === 'windows' ? 'python' : 'python3'} network_agent.py --code ${currentPairingCode}`;

  return (
    <div className="section animate-in">
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          <span style={{ background: 'var(--gradient-hero)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Agent Setup & Pairing
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto' }}>
          Pair your local Python Network Agent with the dashboard to measure real UDP network jitter & RTT
        </p>
      </div>

      {/* Cloud vs Local Mode Indicator Banner */}
      {isVercel ? (
        <div className="experiment-banner" style={{ marginBottom: '2rem', borderColor: 'rgba(99, 102, 241, 0.4)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(34, 211, 238, 0.08) 100%)' }}>
          <span style={{ fontSize: '1.5rem' }}>🌐</span>
          <div style={{ flex: 1 }}>
            <strong style={{ color: '#818cf8', fontSize: '0.95rem' }}>Cloud Vercel Deployment</strong>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', margin: '0.25rem 0 0 0' }}>
              You are viewing the hosted Next.js frontend on Vercel. Pairing codes are generated directly in your browser session.
              To stream real network packets, launch the local backend on your computer (<code style={{ color: 'var(--accent-cyan)' }}>npm start</code>) or explore in <strong>Demo Mode</strong>.
            </p>
          </div>
          <Link href="/" className="btn btn-ghost" style={{ alignSelf: 'center', fontSize: '0.8rem' }}>
            🎮 Try Demo Mode
          </Link>
        </div>
      ) : null}

      {/* Agent & Backend Live Connection Status */}
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span
            className={`status-dot ${agentConnected ? 'connected' : isPaired ? 'connecting' : backendOnline ? 'disconnected' : 'connecting'}`}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            {agentConnected
              ? '🟢 Python Agent Connected & Active'
              : isPaired
                ? '🟡 Agent Paired (Waiting for process)'
                : backendOnline === false
                  ? '🔴 Backend Server Offline (Running on Vercel / Cloud)'
                  : '🔴 Agent Not Connected'}
          </span>
        </div>

        {agentId && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Active Agent ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{agentId.slice(0, 8)}...</code>
          </p>
        )}

        {agentConnected ? (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--accent-green)', fontWeight: 600, marginBottom: '0.5rem' }}>
              ✓ Your Python agent is actively streaming measurements to this dashboard!
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.75rem' }}>
              <Link href="/" className="btn btn-primary">
                ⚡ Go to Live Dashboard
              </Link>
              <button className="btn btn-ghost" onClick={revokeAgent}>
                Revoke & Re-pair
              </button>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: 500, margin: '0.5rem auto 0 auto' }}>
            Use the 6-character pairing code below to link your local Python agent to this session.
          </p>
        )}
      </div>

      {/* ACTIVE PAIRING CODE CARD (Always Generated & Ready) */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid rgba(34, 211, 238, 0.3)', background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.06) 0%, rgba(99, 102, 241, 0.06) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
              🔑 Your Active Pairing Code
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
              Valid for your session • Enter this code when starting the Python agent
            </p>
          </div>
          <button className="btn btn-ghost" onClick={handleRefreshCode} style={{ fontSize: '0.8rem' }}>
            🔄 Generate Fresh Code
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
          <div
            className="pairing-code"
            suppressHydrationWarning
            style={{
              fontSize: '2.5rem',
              fontWeight: 900,
              letterSpacing: '0.35em',
              padding: '0.75rem 2rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0,0,0,0.5)',
              border: '2px solid var(--accent-cyan)',
              boxShadow: '0 0 20px rgba(34, 211, 238, 0.25)',
              color: '#22d3ee',
            }}
          >
            {currentPairingCode}
          </div>

          <button
            className="btn btn-primary"
            onClick={() => copyToClipboard(currentPairingCode, setCopiedCode)}
            style={{ height: 'fit-content' }}
          >
            {copiedCode ? '✓ Copied Code!' : '📋 Copy Code'}
          </button>
        </div>

        {codeExpired && (
          <p style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', textAlign: 'center' }}>
            ⏰ This pairing code has expired. Click <strong>Generate Fresh Code</strong> to create a new one.
          </p>
        )}
      </div>

      {/* SINGLE COMMAND QUICK START */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid rgba(99, 102, 241, 0.4)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(34, 211, 238, 0.05) 100%)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>⚡</span> Single-Command All-in-One Start
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Run the full stack (Backend on port 4000, UDP Server on port 5005, and Local Frontend) with a single command from your project root:
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#22d3ee', marginBottom: '0.75rem' }}>
          <code>npm start</code>
          <button
            className="btn btn-ghost"
            style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
            onClick={() => copyToClipboard('npm start', setCopiedNpm)}
          >
            {copiedNpm ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          On Windows, you can also simply double-click <code style={{ color: '#a78bfa' }}>start.bat</code> in the repository root.
        </p>
      </div>

      {/* Step-by-Step Setup Guide */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', textAlign: 'center' }}>
          📋 Step-by-Step Guide
        </h2>

        <div className="setup-steps">
          {/* Step 1 */}
          <div className="setup-step">
            <div className="step-number">1</div>
            <div className="step-content" style={{ flex: 1 }}>
              <h3>Start Backend Services</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Run from the repository root:
              </p>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>
                <code>npm start</code>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Starts the WebSocket relay (port 4000) and UDP impairment test server (port 5005).
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="setup-step">
            <div className="step-number">2</div>
            <div className="step-content" style={{ flex: 1 }}>
              <h3>Run the Python Agent</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Open a new terminal window in the <code style={{ color: 'var(--accent-cyan)' }}>agent</code> directory:
              </p>

              <div className="tabs" style={{ marginTop: '0.5rem' }}>
                <div className={`tab ${activeTab === 'windows' ? 'active' : ''}`} onClick={() => setActiveTab('windows')}>Windows</div>
                <div className={`tab ${activeTab === 'mac' ? 'active' : ''}`} onClick={() => setActiveTab('mac')}>macOS</div>
                <div className={`tab ${activeTab === 'linux' ? 'active' : ''}`} onClick={() => setActiveTab('linux')}>Linux</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '0.5rem' }}>
                <code>cd agent</code><br />
                <code>{activeTab === 'mac' ? 'pip3' : 'pip'} install -r requirements.txt</code><br />
                <code suppressHydrationWarning>{agentCommand}</code>
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => copyToClipboard(agentCommand, setCopiedCommand)}
                  >
                    {copiedCommand ? '✓ Copied Command!' : '📋 Copy Command'}
                  </button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem', marginBottom: '0.25rem' }}>
                  After first pairing (stored credentials used automatically):
                </p>
                <code>{activeTab === 'windows' ? 'python' : 'python3'} network_agent.py</code>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="setup-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h3>Start Testing in Dashboard</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Once paired, open the <Link href="/" style={{ color: 'var(--accent-cyan)' }}>Dashboard</Link> and click <strong>▶ Start Test</strong> or <strong>🔬 Run Paired Experiment</strong> to stream real-time RTT & jitter metrics!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Backend Configuration (Optional) */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowAdvanced(!showAdvanced)}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚙️ Advanced: Custom Backend URL {showAdvanced ? '▲' : '▼'}
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {backendUrl}
          </span>
        </div>

        {showAdvanced && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              If your backend is running on a custom port, ngrok tunnel, or cloud server (e.g. Render / Railway):
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={customBackend}
                onChange={(e) => setCustomBackend(e.target.value)}
                placeholder="http://localhost:4000"
                style={{ flex: 1, padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius-sm)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              />
              <button
                className="btn btn-primary"
                onClick={() => setBackendUrl(customBackend)}
                style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Built-in Demo Mode Card */}
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          🎮 Interactive Demo Mode (No Setup Required)
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: 550, margin: '0 auto 1.25rem auto' }}>
          The dashboard includes a built-in physics-based network simulator with adjustable Base Delay, Random Jitter, and Packet Loss. Perfect for quick demonstrations!
        </p>
        <Link href="/" className="btn btn-success btn-lg">
          ⚡ Launch Interactive Demo
        </Link>
      </div>

      {/* Architecture */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>🏗️ System Architecture</h2>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 2, color: 'var(--accent-cyan)', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <div>🌐 <strong>Next.js Frontend</strong> (Vercel / Localhost:3000)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ WebSocket Relay</div>
          <div>⚡ <strong>Node.js Backend & Relay</strong> (Port 4000)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ WebSocket Control Channel</div>
          <div>🐍 <strong>Python Network Agent</strong> (UDP Packet Engine)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ UDP Packets (High Precision)</div>
          <div>📡 <strong>UDP Impairment Test Server</strong> (Port 5005)</div>
        </div>
      </div>

      {/* Source Code */}
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>📦 Project Repository</h2>
        <a href="https://github.com/saileshl/CN-MINI-PROJ" target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg">
          🔗 View on GitHub
        </a>
      </div>
    </div>
  );
}
