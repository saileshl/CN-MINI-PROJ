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
  const [copiedClone, setCopiedClone] = useState(false);
  const [copiedStart, setCopiedStart] = useState(false);
  const [copiedPip, setCopiedPip] = useState(false);
  const [copiedAgent, setCopiedAgent] = useState(false);
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
  const pyCmd = activeTab === 'mac' ? 'python3' : 'python';
  const pipCmd = activeTab === 'mac' ? 'pip3' : 'pip';
  const agentPairCommand = `${pyCmd} network_agent.py --code ${currentPairingCode}`;
  const agentRunCommand = `${pyCmd} network_agent.py`;

  return (
    <div className="section animate-in">
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
          Complete A-to-Z Agent Setup
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 620, margin: '0 auto' }}>
          Follow these 5 simple steps to clone the repository, launch the backend relay, and stream live UDP measurements.
        </p>
      </div>

      {/* Live Agent Connection Status Bar */}
      <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <span
            className={`status-dot ${agentConnected ? 'connected' : isPaired ? 'connecting' : 'disconnected'}`}
            style={{ width: 8, height: 8 }}
          />
          <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {agentConnected
              ? 'Python Agent Connected & Ready to Stream'
              : isPaired
                ? 'Agent Paired (Awaiting process startup)'
                : 'Agent Not Connected · Follow Steps Below'}
          </span>
        </div>

        {agentId && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Active Agent ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cream)' }}>{agentId.slice(0, 8)}...</code>
          </p>
        )}

        {agentConnected && (
          <div style={{ marginTop: '0.85rem' }}>
            <p style={{ color: 'var(--accent-green)', fontWeight: 500, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              ✓ Your Python agent is active! Go to the Dashboard to run tests.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <Link href="/" className="btn btn-start">
                ⚡ Go to Live Dashboard
              </Link>
              <button className="btn btn-ghost" onClick={revokeAgent}>
                Revoke & Re-pair
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ACTIVE PAIRING CODE CARD */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              🔑 Your Session Pairing Code
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0.2rem 0 0 0' }}>
              Use this unique code in Step 4 to link your local agent
            </p>
          </div>
          <button className="btn btn-ghost" onClick={handleRefreshCode} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
            🔄 Refresh Code
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
          <div
            className="pairing-code"
            suppressHydrationWarning
            style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              letterSpacing: '0.25em',
              padding: '0.65rem 2rem',
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
            {copiedCode ? '✓ Copied' : '📋 Copy Code'}
          </button>
        </div>

        {codeExpired && (
          <p style={{ color: 'var(--accent-red)', fontSize: '0.75rem', textAlign: 'center' }}>
            ⏰ Code expired. Click <strong>Refresh Code</strong> to generate a fresh pairing key.
          </p>
        )}
      </div>

      {/* OS PLATFORM SELECTOR TABS */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['windows', 'mac', 'linux'] as const).map((tab) => (
          <button
            key={tab}
            className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', textTransform: 'capitalize' }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'windows' ? '🪟 Windows Instructions' : tab === 'mac' ? '🍎 macOS Instructions' : '🐧 Linux Instructions'}
          </button>
        ))}
      </div>

      {/* A-TO-Z STEP-BY-STEP GUIDE */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* STEP 1: CLONE REPOSITORY */}
        <div className="step-card">
          <div className="step-number">1</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Clone the Project Repository
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
              Open your terminal or PowerShell and clone the codebase:
            </p>
            <div className="code-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <code>git clone https://github.com/saileshl/CN-MINI-PROJ.git && cd CN-MINI-PROJ</code>
              <button
                className="btn btn-ghost"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.725rem', marginLeft: '0.5rem' }}
                onClick={() => copyToClipboard('git clone https://github.com/saileshl/CN-MINI-PROJ.git && cd CN-MINI-PROJ', setCopiedClone)}
              >
                {copiedClone ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* STEP 2: START BACKEND & UDP ECHO SERVER */}
        <div className="step-card">
          <div className="step-number">2</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Start Backend Relay & UDP Impairment Server
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
              {activeTab === 'windows' ? (
                <>On Windows, simply double-click <strong>start.bat</strong> in the repository root, or run:</>
              ) : (
                <>Install backend dependencies and start the WebSocket relay (Port 4000) and UDP Echo Server (Port 5005):</>
              )}
            </p>
            <div className="code-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <code>npm install && npm start</code>
              <button
                className="btn btn-ghost"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.725rem', marginLeft: '0.5rem' }}
                onClick={() => copyToClipboard('npm install && npm start', setCopiedStart)}
              >
                {copiedStart ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* STEP 3: INSTALL PYTHON DEPENDENCIES */}
        <div className="step-card">
          <div className="step-number">3</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Install Python Agent Dependencies
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
              Open a second terminal window, navigate into the <code>agent</code> folder, and install requirements:
            </p>
            <div className="code-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <code>cd agent && {pipCmd} install -r requirements.txt</code>
              <button
                className="btn btn-ghost"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.725rem', marginLeft: '0.5rem' }}
                onClick={() => copyToClipboard(`cd agent && ${pipCmd} install -r requirements.txt`, setCopiedPip)}
              >
                {copiedPip ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* STEP 4: LAUNCH AGENT WITH PAIRING CODE */}
        <div className="step-card" style={{ borderColor: 'var(--border-strong)' }}>
          <div className="step-number" style={{ background: 'var(--accent-cream)', color: 'var(--text-inverse)' }}>4</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Launch the Agent (Paired to this Dashboard)
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
              Run the agent with your session pairing code from above:
            </p>
            <div className="code-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <code suppressHydrationWarning>{agentPairCommand}</code>
              <button
                className="btn btn-start"
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.725rem', marginLeft: '0.5rem' }}
                onClick={() => copyToClipboard(agentPairCommand, setCopiedAgent)}
              >
                {copiedAgent ? '✓ Copied Command' : '📋 Copy Command'}
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Credentials are saved automatically to <code>.agent_credentials.json</code>. For all future startups, simply run <code>{agentRunCommand}</code> without the <code>--code</code> flag.
            </p>
          </div>
        </div>

        {/* STEP 5: STREAM LIVE DATA ON DASHBOARD */}
        <div className="step-card">
          <div className="step-number">5</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Stream Real-Time Telemetry on the Dashboard
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Once the agent prints <code>[✓] Paired successfully!</code>, return to the Dashboard and click <strong>▶ Start Test</strong> to stream 200 UDP measurement packets live.
            </p>
            <Link href="/" className="btn btn-primary" style={{ display: 'inline-flex' }}>
              ⚡ Open Live Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
