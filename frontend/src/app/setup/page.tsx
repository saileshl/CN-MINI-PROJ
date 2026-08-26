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
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
          Agent Setup & Pairing
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 580, margin: '0 auto' }}>
          Connect your local Python UDP agent to measure hardware-level network jitter and latency in real time.
        </p>
      </div>

      {/* Agent & Backend Connection Status */}
      <div className="glass-card" style={{ padding: '1.75rem', textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span
            className={`status-dot ${agentConnected ? 'connected' : isPaired ? 'connecting' : 'disconnected'}`}
            style={{ width: 8, height: 8 }}
          />
          <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {agentConnected
              ? 'Python Agent Connected & Streaming'
              : isPaired
                ? 'Agent Paired (Awaiting process startup)'
                : 'Agent Not Connected'}
          </span>
        </div>

        {agentId && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Active Agent ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cream)' }}>{agentId.slice(0, 8)}...</code>
          </p>
        )}

        {agentConnected ? (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--accent-sage)', fontWeight: 500, fontSize: '0.85rem', marginBottom: '0.85rem' }}>
              Your Python agent is actively streaming measurements to this dashboard.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <Link href="/" className="btn btn-primary">
                Go to Live Dashboard
              </Link>
              <button className="btn btn-ghost" onClick={revokeAgent}>
                Revoke & Re-pair
              </button>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', maxWidth: 480, margin: '0.4rem auto 0 auto' }}>
            Use the 6-character pairing code below to link your local Python agent to this session.
          </p>
        )}
      </div>

      {/* ACTIVE PAIRING CODE CARD */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              Session Pairing Code
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0.2rem 0 0 0' }}>
              Enter this code when launching the Python agent
            </p>
          </div>
          <button className="btn btn-ghost" onClick={handleRefreshCode} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
            Refresh Code
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
          <div
            className="pairing-code"
            suppressHydrationWarning
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              letterSpacing: '0.25em',
              padding: '0.65rem 1.75rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-strong)',
              color: 'var(--accent-cream)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {currentPairingCode}
          </div>

          <button
            className="btn btn-primary"
            onClick={() => copyToClipboard(currentPairingCode, setCopiedCode)}
          >
            {copiedCode ? 'Copied' : 'Copy Code'}
          </button>
        </div>

        {codeExpired && (
          <p style={{ color: 'var(--accent-rose)', fontSize: '0.75rem', textAlign: 'center' }}>
            Code expired. Click <strong>Refresh Code</strong> to generate a new pairing key.
          </p>
        )}
      </div>

      {/* SINGLE COMMAND QUICK START */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
          Single-Command All-in-One Start
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginBottom: '0.85rem' }}>
          Launch the Backend Relay (port 4000) and UDP Echo Server (port 5005) with one command:
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', padding: '0.85rem 1.1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-cream)', marginBottom: '0.5rem', border: '1px solid var(--border-subtle)' }}>
          <code>npm start</code>
          <button
            className="btn btn-ghost"
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
            onClick={() => copyToClipboard('npm start', setCopiedNpm)}
          >
            {copiedNpm ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          On Windows, you can also double-click <code style={{ color: 'var(--text-secondary)' }}>start.bat</code> in the repository root.
        </p>
      </div>

      {/* STEP BY STEP GUIDE */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
          Step-by-Step Instructions
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Step 1 */}
          <div className="step-card">
            <div className="step-number">1</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Start Backend Services</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', margin: '0.2rem 0 0.4rem 0' }}>
                Run from the repository root:
              </p>
              <div className="code-block" style={{ padding: '0.65rem 0.85rem' }}>
                <code>npm start</code>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="step-card">
            <div className="step-number">2</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Run Python Agent</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', margin: '0.2rem 0 0.4rem 0' }}>
                Open a new terminal in the <code>agent</code> directory:
              </p>

              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem' }}>
                {(['windows', 'mac', 'linux'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`btn ${activeTab === tab ? 'btn-secondary' : 'btn-ghost'}`}
                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', textTransform: 'capitalize' }}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'windows' ? 'Windows' : tab === 'mac' ? 'macOS' : 'Linux'}
                  </button>
                ))}
              </div>

              <div className="code-block" style={{ padding: '0.75rem 1rem' }}>
                <code>cd agent</code><br />
                <code>{activeTab === 'mac' ? 'pip3' : 'pip'} install -r requirements.txt</code><br />
                <code suppressHydrationWarning>{agentCommand}</code>
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.725rem', padding: '0.25rem 0.55rem' }}
                    onClick={() => copyToClipboard(agentCommand, setCopiedCommand)}
                  >
                    {copiedCommand ? 'Copied' : 'Copy Command'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="step-card">
            <div className="step-number">3</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Stream Live Telemetry</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', margin: '0.2rem 0 0.4rem 0' }}>
                Once paired, navigate to the <Link href="/" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>Dashboard</Link> and click <strong>Start Test</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
