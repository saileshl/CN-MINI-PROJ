'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { useWebSocket, WSMessage } from '@/hooks/useWebSocket';
import { useExperiment } from '@/hooks/useExperiment';
import { saveTestResult, saveExperiment } from '@/lib/storage';
import { streamDemoTest, generateDemoExperiment } from '@/lib/demo';
import RealtimeChart from '@/components/RealtimeChart';
import Link from 'next/link';

interface Metrics {
  avg_rtt?: number;
  min_rtt?: number;
  max_rtt?: number;
  stdev_rtt?: number;
  p50_rtt?: number;
  p95_rtt?: number;
  p99_rtt?: number;
  avg_rtt_variation?: number;
  packet_loss_percent?: number;
  packets_sent?: number;
  packets_received?: number;
  sample_count?: number;
  buffer_stats?: {
    target_depth_ms?: number;
    effective_delivery_variation?: number;
    packets_dropped_late?: number;
    packets_missing?: number;
    estimated_variation_ms?: number;
  };
}

export default function DashboardPage() {
  const { session, agentConnected, connectionState, backendOnline, send, subscribe } = useSession();
  const experiment = useExperiment();
  const experimentRef = useRef(experiment);
  useEffect(() => { experimentRef.current = experiment; }, [experiment]);

  // Operational mode: Live if connected or during connecting grace period
  const isLive = agentConnected || connectionState === 'connected' || backendOnline === true;
  const isConnecting = connectionState === 'connecting' && backendOnline !== false;
  const isDemo = !isLive && !isConnecting && backendOnline === false;

  const [testRunning, setTestRunning] = useState(false);
  const [mitigationEnabled, setMitigationEnabled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>({});
  const [rttHistory, setRttHistory] = useState<number[]>([]);
  const [variationHistory, setVariationHistory] = useState<number[]>([]);
  const demoCancel = useRef<{ cancel: () => void } | null>(null);

  // Impairment controls
  const [baseDelay, setBaseDelay] = useState(30);
  const [randomJitter, setRandomJitter] = useState(40);
  const [packetLoss, setPacketLoss] = useState(5);

  // Subscribe to live WebSocket messages
  useEffect(() => {
    const unsubscribe = subscribe((msg: WSMessage) => {
      switch (msg.type) {
        case 'idle_ping':
          // Keep agent alive silently without polluting the standby graph
          break;

        case 'measurement': {
          const batch = msg.batch as Array<Record<string, unknown>>;
          const newRtts: number[] = [];
          batch?.forEach((pkt) => {
            if (pkt.rtt !== null && pkt.rtt !== undefined) newRtts.push(pkt.rtt as number);
          });
          const batchMetrics = msg.batchMetrics as Metrics;
          const newVars: number[] = [];
          if (batchMetrics?.avg_rtt_variation !== undefined) newVars.push(batchMetrics.avg_rtt_variation);
          setRttHistory(prev => [...prev, ...newRtts].slice(-200));
          setVariationHistory(prev => [...prev, ...newVars].slice(-200));
          setProgress((msg.progress as number) || 0);
          if (msg.bufferStats) setMetrics(prev => ({ ...prev, buffer_stats: msg.bufferStats as Metrics['buffer_stats'] }));
          break;
        }

        case 'test_complete': {
          const m = msg.metrics as Metrics;
          setMetrics(m);
          setTestRunning(false);
          setProgress(1);
          saveTestResult({ id: Date.now().toString(), timestamp: Date.now(), metrics: m as Record<string, unknown>, mitigationEnabled: msg.mitigationEnabled as boolean });
          break;
        }

        case 'mitigation_status':
          setMitigationEnabled(msg.enabled as boolean);
          break;

        case 'experiment_created':
        case 'experiment_results': {
          const exp = experimentRef.current;
          exp.handleExperimentMessage(msg as Record<string, unknown>);
          if (msg.type === 'experiment_results' && msg.testPhase === 'B') {
            saveExperiment({
              id: Date.now().toString(), experimentId: exp.experimentId || '', timestamp: Date.now(),
              config: exp.config as unknown as Record<string, unknown> || {},
              testAResults: exp.testAResults, testBResults: msg.results as Record<string, unknown>,
            });
          }
          break;
        }
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // Demo actions
  const handleDemoTest = () => {
    setTestRunning(true); setProgress(0); setRttHistory([]); setVariationHistory([]); setMetrics({});
    const controller = streamDemoTest(
      { packetCount: 200, baseDelayMs: baseDelay, randomJitterMs: randomJitter, packetLossPercent: packetLoss, packetIntervalMs: 50 },
      mitigationEnabled,
      (batch, batchMetrics, prog) => {
        const newRtts = batch.filter(p => p.rtt !== null).map(p => p.rtt as number);
        setRttHistory(prev => [...prev, ...newRtts].slice(-200));
        if (batchMetrics.avg_rtt_variation !== undefined) {
          setVariationHistory(prev => [...prev, batchMetrics.avg_rtt_variation].slice(-200));
        }
        setProgress(prog);
        if (batchMetrics.buffer_stats) setMetrics(prev => ({ ...prev, buffer_stats: batchMetrics.buffer_stats }));
      },
      (finalMetrics) => {
        setMetrics(finalMetrics); setTestRunning(false); setProgress(1);
        saveTestResult({ id: Date.now().toString(), timestamp: Date.now(), metrics: finalMetrics as unknown as Record<string, unknown>, mitigationEnabled });
      },
    );
    demoCancel.current = controller;
  };

  const handleDemoExperiment = () => {
    setTestRunning(true); setProgress(0); setRttHistory([]); setVariationHistory([]); setMetrics({});
    const config = { packetCount: 200, baseDelayMs: baseDelay, randomJitterMs: randomJitter, packetLossPercent: packetLoss, packetIntervalMs: 50 };
    const { testA, testB } = generateDemoExperiment(config);

    let step = 0;
    const totalSteps = 40;
    const animateA = setInterval(() => {
      step++;
      const end = Math.min(Math.floor((step / totalSteps) * testA.packets.length), testA.packets.length);
      const slice = testA.packets.slice(0, end);
      const rtts = slice.filter(p => p.rtt !== null).map(p => p.rtt as number);
      setRttHistory(rtts.slice(-200));
      setProgress(step / (totalSteps * 2));

      if (step >= totalSteps) {
        clearInterval(animateA);
        setMetrics(testA.metrics);
        const expId = `DEMO-EXP-${Date.now()}`;

        let step2 = 0;
        setTimeout(() => {
          const animateB = setInterval(() => {
            step2++;
            const end2 = Math.min(Math.floor((step2 / totalSteps) * testB.packets.length), testB.packets.length);
            const slice2 = testB.packets.slice(0, end2);
            const rtts2 = slice2.filter(p => p.rtt !== null).map(p => p.rtt as number);
            setRttHistory(rtts2.slice(-200));
            setProgress(0.5 + step2 / (totalSteps * 2));

            if (step2 >= totalSteps) {
              clearInterval(animateB);
              setMetrics(testB.metrics);
              setTestRunning(false);
              setProgress(1);

              saveExperiment({
                id: Date.now().toString(), experimentId: expId, timestamp: Date.now(),
                config: config as unknown as Record<string, unknown>,
                testAResults: testA.metrics as unknown as Record<string, unknown>,
                testBResults: testB.metrics as unknown as Record<string, unknown>,
              });
            }
          }, 100);
        }, 800);
      }
    }, 100);
  };

  // Actions
  const handleStartTest = () => {
    if (isDemo) { handleDemoTest(); return; }
    setTestRunning(true); setProgress(0); setRttHistory([]); setVariationHistory([]); setMetrics({});
    send({ type: 'start_test' });
  };

  const handleStopTest = () => {
    if (isDemo) { demoCancel.current?.cancel(); setTestRunning(false); return; }
    send({ type: 'stop_test' }); setTestRunning(false);
  };

  const handleToggleMitigation = () => {
    if (isDemo) { setMitigationEnabled(!mitigationEnabled); return; }
    send({ type: mitigationEnabled ? 'disable_mitigation' : 'enable_mitigation' });
  };

  const handleConfigureImpairment = () => {
    if (isLive) send({ type: 'configure_impairment', config: { baseDelayMs: baseDelay, randomJitterMs: randomJitter, packetLossPercent: packetLoss } });
  };

  const handleStartExperiment = () => {
    if (isDemo) { handleDemoExperiment(); return; }
    send({ type: 'start_experiment', config: { packetCount: 200, baseDelayMs: baseDelay, randomJitterMs: randomJitter, packetLossPercent: packetLoss } });
  };

  const impairmentLocked = experiment.isRunning;

  return (
    <div className="section animate-in">
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
          Network Jitter Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 600, margin: '0 auto' }}>
          Real-time UDP measurement, RTT variation analysis, and adaptive jitter buffer mitigation.
        </p>

        {/* Live Status Badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {isDemo ? (
            <div className="badge badge-warning">
              🎮 Demo Mode Active (Simulated)
            </div>
          ) : (
            <>
              <div className={`badge ${connectionState === 'connected' ? 'badge-success' : 'badge-info'}`}>
                <span className={`status-dot ${connectionState === 'connected' ? 'connected' : 'connecting'}`} />
                WS: {connectionState}
              </div>
              <div className={`badge ${agentConnected ? 'badge-success' : isConnecting ? 'badge-info' : 'badge-danger'}`}>
                <span className={`status-dot ${agentConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'}`} />
                Agent: {agentConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Not Connected'}
              </div>
            </>
          )}
          {mitigationEnabled && <div className="badge badge-success">🛡️ Jitter Buffer Active</div>}
        </div>
      </div>

      {/* Stats Metrics Cards with Vivid High-Contrast Indicators */}
      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <span className="stat-label">Average RTT</span>
          <span className="stat-value" style={{ color: '#FFFFE3' }}>
            {metrics.avg_rtt !== undefined ? metrics.avg_rtt.toFixed(1) : '—'}
          </span>
          <span className="stat-unit">milliseconds</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">RTT Variation (Jitter)</span>
          <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
            {metrics.avg_rtt_variation !== undefined ? metrics.avg_rtt_variation.toFixed(2) : '—'}
          </span>
          <span className="stat-unit">ms variance</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Packet Loss</span>
          <span
            className="stat-value"
            style={{
              color: metrics.packet_loss_percent !== undefined
                ? metrics.packet_loss_percent > 0
                  ? 'var(--accent-red)'
                  : 'var(--accent-green)'
                : 'inherit'
            }}
          >
            {metrics.packet_loss_percent !== undefined ? metrics.packet_loss_percent.toFixed(1) : '—'}
          </span>
          <span className="stat-unit">percentage</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">P95 Latency</span>
          <span className="stat-value" style={{ color: '#A78BFA' }}>
            {metrics.p95_rtt !== undefined ? metrics.p95_rtt.toFixed(1) : '—'}
          </span>
          <span className="stat-unit">ms threshold</span>
        </div>
        {mitigationEnabled && metrics.buffer_stats && (
          <>
            <div className="stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.35)' }}>
              <span className="stat-label">Buffered Jitter</span>
              <span className="stat-value" style={{ color: 'var(--accent-green)' }}>
                {metrics.buffer_stats.effective_delivery_variation?.toFixed(2) ?? '—'}
              </span>
              <span className="stat-unit">ms (mitigated)</span>
            </div>
            <div className="stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.35)' }}>
              <span className="stat-label">Buffer Depth</span>
              <span className="stat-value" style={{ color: '#A78BFA' }}>
                {metrics.buffer_stats.target_depth_ms?.toFixed(0) ?? '—'}
              </span>
              <span className="stat-unit">ms queue</span>
            </div>
          </>
        )}
      </div>

      {/* Real-time Progress Bar */}
      {testRunning && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            <span>Streaming UDP Packets...</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{Math.round(progress * 100)}%</span>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Real-time Charts with Live Telemetry */}
      <div className="charts-grid">
        <RealtimeChart
          title="Round-Trip Time (RTT)"
          unit="ms"
          data={rttHistory}
          colorTheme="cyan"
          icon="📊"
          height={220}
        />
        <RealtimeChart
          title="RTT Variation (Jitter)"
          unit="ms"
          data={variationHistory}
          colorTheme="emerald"
          icon="📈"
          height={220}
        />
      </div>

      {/* Control Panel Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {/* Test Controls */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
            ⚡ Execution Controls
          </h3>

          {/* Prompt banner when agent is connected and ready */}
          {isLive && agentConnected && !testRunning && (
            <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem' }}>🟢</span>
              <div style={{ fontSize: '0.8rem', color: '#34D399', fontWeight: 600 }}>
                Agent connected! Click <strong>Start Test</strong> to benchmark 200 packets.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
            <button
              className="btn btn-start"
              style={{ flex: 1.2 }}
              onClick={handleStartTest}
              disabled={testRunning || (!isDemo && !agentConnected)}
            >
              ▶ Start Test
            </button>
            <button
              className="btn btn-danger"
              style={{ flex: 0.8 }}
              onClick={handleStopTest}
              disabled={!testRunning}
            >
              ⏹ Stop
            </button>
          </div>

          <button
            className="btn btn-indigo"
            style={{ width: '100%', marginBottom: '1rem' }}
            onClick={handleStartExperiment}
            disabled={testRunning || (!isDemo && !agentConnected)}
          >
            🔬 Run Paired A/B Experiment
          </button>

          {/* Mitigation Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Adaptive Jitter Buffer</div>
              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Playout delay smoothing</div>
            </div>
            <button
              className={`btn ${mitigationEnabled ? 'btn-success' : 'btn-ghost'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
              onClick={handleToggleMitigation}
            >
              {mitigationEnabled ? 'Active (ON)' : 'Disabled (OFF)'}
            </button>
          </div>
        </div>

        {/* Network Impairment Engine */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
            🌊 Synthetic Impairment Engine
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="slider-group">
              <label>Base Delay <span>{baseDelay} ms</span></label>
              <input type="range" min={0} max={200} value={baseDelay} onChange={e => setBaseDelay(Number(e.target.value))} disabled={impairmentLocked} />
            </div>
            <div className="slider-group">
              <label>Random Jitter <span>±{randomJitter} ms</span></label>
              <input type="range" min={0} max={100} value={randomJitter} onChange={e => setRandomJitter(Number(e.target.value))} disabled={impairmentLocked} />
            </div>
            <div className="slider-group">
              <label>Packet Loss <span>{packetLoss}%</span></label>
              <input type="range" min={0} max={30} value={packetLoss} onChange={e => setPacketLoss(Number(e.target.value))} disabled={impairmentLocked} />
            </div>

            {isLive && (
              <button className="btn btn-ghost" onClick={handleConfigureImpairment} disabled={impairmentLocked || !agentConnected}>
                Apply Impairment to UDP Server
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Telemetry Stats */}
      {Object.keys(metrics).length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem', marginTop: '1.25rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Detailed Telemetry
          </h3>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            <MiniStat label="Min RTT" value={metrics.min_rtt} unit="ms" />
            <MiniStat label="Max RTT" value={metrics.max_rtt} unit="ms" />
            <MiniStat label="Std Dev" value={metrics.stdev_rtt} unit="ms" />
            <MiniStat label="P50" value={metrics.p50_rtt} unit="ms" />
            <MiniStat label="P95" value={metrics.p95_rtt} unit="ms" />
            <MiniStat label="P99" value={metrics.p99_rtt} unit="ms" />
            <MiniStat label="Sent" value={metrics.packets_sent} />
            <MiniStat label="Received" value={metrics.packets_received} />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  return (
    <div style={{ padding: '0.75rem 0.85rem', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: '0.675rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '0.15rem', color: 'var(--text-primary)' }}>
        {value !== undefined ? (typeof value === 'number' ? value.toFixed(1) : value) : '—'}
        {unit && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}
