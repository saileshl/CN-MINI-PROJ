'use client';

import { useState, useEffect } from 'react';
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
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          <span style={{ background: 'var(--gradient-hero)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Agent Setup & Pairing
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: 600, margin: '0 auto' }}>
          Connect your local Python UDP agent to measure hardware-level network jitter and latency in real time.
        </p>
      </div>

      {/* Agent & Backend Connection Status */}
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <span
            className={`status-dot ${agentConnected ? 'connected' : isPaired ? 'connecting' : backendOnline ? 'disconnected' : 'connecting'}`}
            style={{ width: 14, height: 14 }}
          />
          <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            {agentConnected
              ? '🟢 Python Agent Connected & Streaming'
              : isPaired
                ? '🟡 Agent Paired (Waiting for process)'
                : backendOnline === false
                  ? '🔴 Backend Server Offline'
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
            <p style={{ color: 'var(--accent-green)', fontWeight: 600, marginBottom: '0.75rem' }}>
              ✓ Your Python agent is actively streaming measurements to this dashboard!
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
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

      {/* ACTIVE PAIRING CODE CARD */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid rgba(0, 240, 255, 0.3)', background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.05) 0%, rgba(99, 102, 241, 0.05) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
              🔑 Session Pairing Code
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
              Enter this code when launching the Python agent
            </p>
          </div>
          <button className="btn btn-ghost" onClick={handleRefreshCode} style={{ fontSize: '0.8rem' }}>
            🔄 Refresh Code
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
              background: 'rgba(0,0,0,0.6)',
              border: '2px solid var(--accent-cyan)',
              boxShadow: '0 0 25px rgba(0, 240, 255, 0.25)',
              color: '#00f0ff',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {currentPairingCode}
          </div>

          <button
            className="btn btn-primary"
            onClick={() => copyToClipboard(currentPairingCode, setCopiedCode)}
          >
            {copiedCode ? '✓ Copied Code!' : '📋 Copy Code'}
          </button>
        </div>

        {codeExpired && (
          <p style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', textAlign: 'center' }}>
            ⏰ Code expired. Click <strong>Refresh Code</strong> to generate a new pairing key.
          </p>
        )}
      </div>

      {/* SINGLE COMMAND QUICK START */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid rgba(99, 102, 241, 0.3)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(0, 240, 255, 0.03) 100%)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>⚡</span> Single-Command All-in-One Start
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Launch the Backend Relay (port 4000) and UDP Echo Server (port 5005) with one command:
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: '#00f0ff', marginBottom: '0.75rem', border: '1px solid rgba(255,255,255,0.06)' }}>
          <code>npm start</code>
          <button
            className="btn btn-ghost"
            style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}
            onClick={() => copyToClipboard('npm start', setCopiedNpm)}
          >
            {copiedNpm ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          On Windows, you can also simply double-click <code style={{ color: '#a78bfa' }}>start.bat</code> in the repository root.
        </p>
      </div>

      {/* STEP BY STEP GUIDE */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>
          📋 Step-by-Step Instructions
        </h2>

        <div className="setup-steps">
          {/* Step 1 */}
          <div className="setup-step">
            <div className="step-number">1</div>
            <div className="step-content" style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Start Backend Services</h3>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0.5rem 0' }}>
                Run from the repository root:
              </p>
              <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-cyan)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <code>npm start</code>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="setup-step">
            <div className="step-number">2</div>
            <div className="step-content" style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Run Python Agent</h3>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0.5rem 0' }}>
                Open a new terminal in the <code style={{ color: 'var(--accent-cyan)' }}>agent</code> directory:
              </p>

              <div className="tabs" style={{ marginBottom: '0.75rem' }}>
                <div className={`tab ${activeTab === 'windows' ? 'active' : ''}`} onClick={() => setActiveTab('windows')}>Windows</div>
                <div className={`tab ${activeTab === 'mac' ? 'active' : ''}`} onClick={() => setActiveTab('mac')}>macOS</div>
                <div className={`tab ${activeTab === 'linux' ? 'active' : ''}`} onClick={() => setActiveTab('linux')}>Linux</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.825rem', color: 'var(--accent-cyan)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <code>cd agent</code><br />
                <code>{activeTab === 'mac' ? 'pip3' : 'pip'} install -r requirements.txt</code><br />
                <code suppressHydrationWarning>{agentCommand}</code>
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => copyToClipboard(agentCommand, setCopiedCommand)}
                  >
                    {copiedCommand ? '✓ Copied Command!' : '📋 Copy Command'}
                  </button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem', marginBottom: '0.25rem' }}>
                  After initial pairing (credentials stored locally):
                </p>
                <code>{activeTab === 'windows' ? 'python' : 'python3'} network_agent.py</code>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="setup-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Stream Live Data</h3>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Once paired, return to the <Link href="/" style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>Dashboard</Link> and click <strong>▶ Start Test</strong> to stream live metrics!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ONLY SHOW DEMO CARD IF BACKEND IS CONFIRMED OFFLINE */}
      {backendOnline === false && (
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: '#fbbf24' }}>
            🎮 Looking to Explore Without Setup?
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: 550, margin: '0 auto 1.25rem auto' }}>
            The Dashboard includes a built-in network simulator with adjustable Base Delay, Random Jitter, and Packet Loss for instant demonstration.
          </p>
          <Link href="/" className="btn btn-success btn-lg">
            ⚡ Launch Interactive Demo
          </Link>
        </div>
      )}

      {/* Advanced Backend Configuration */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowAdvanced(!showAdvanced)}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚙️ Advanced: Backend Connection URL {showAdvanced ? '▲' : '▼'}
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {backendUrl}
          </span>
        </div>

        {showAdvanced && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              If your backend is running on a custom port, tunnel, or cloud server:
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={customBackend}
                onChange={(e) => setCustomBackend(e.target.value)}
                placeholder="http://localhost:4000"
                style={{ flex: 1, padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-sm)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
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

      {/* System Architecture */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>🏗️ System Architecture</h2>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem', lineHeight: 2, color: 'var(--accent-cyan)', background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div>🌐 <strong>Next.js Frontend</strong> (Dashboard & Telemetry)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ WebSocket Relay</div>
          <div>⚡ <strong>Node.js Backend & Relay</strong> (Port 4000)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ WebSocket Control Channel</div>
          <div>🐍 <strong>Python Network Agent</strong> (UDP Packet Engine)</div>
          <div style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>↕ UDP Packets (High Precision)</div>
          <div>📡 <strong>UDP Impairment Test Server</strong> (Port 5005)</div>
        </div>
      </div>
    </div>
  );
}
