'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { useWebSocket, WSMessage } from '@/hooks/useWebSocket';
import { useExperiment } from '@/hooks/useExperiment';
import { saveTestResult, saveExperiment } from '@/lib/storage';
import Link from 'next/link';

interface MeasurementData {
  rtt: number;
  seq: number;
  variation?: number;
}

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
  const { session, wsUrl } = useSession();
  const experiment = useExperiment();

  // State
  const [agentConnected, setAgentConnected] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [mitigationEnabled, setMitigationEnabled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>({});
  const [rttHistory, setRttHistory] = useState<number[]>([]);
  const [variationHistory, setVariationHistory] = useState<number[]>([]);

  // Impairment controls
  const [baseDelay, setBaseDelay] = useState(30);
  const [randomJitter, setRandomJitter] = useState(40);
  const [packetLoss, setPacketLoss] = useState(5);

  // Chart refs
  const rttCanvasRef = useRef<HTMLCanvasElement>(null);
  const varCanvasRef = useRef<HTMLCanvasElement>(null);

  const onMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case 'agent_status':
        setAgentConnected(msg.status === 'connected');
        setAgentId(msg.agentId as string || null);
        break;

      case 'measurement': {
        const batch = msg.batch as Array<Record<string, unknown>>;
        const newRtts: number[] = [];
        const newVars: number[] = [];

        batch?.forEach((pkt) => {
          if (pkt.rtt !== null && pkt.rtt !== undefined) {
            newRtts.push(pkt.rtt as number);
          }
        });

        const batchMetrics = msg.batchMetrics as Metrics;
        if (batchMetrics?.avg_rtt_variation !== undefined) {
          newVars.push(batchMetrics.avg_rtt_variation);
        }

        setRttHistory(prev => [...prev, ...newRtts].slice(-200));
        setVariationHistory(prev => [...prev, ...newVars].slice(-200));
        setProgress((msg.progress as number) || 0);

        if (msg.bufferStats) {
          setMetrics(prev => ({ ...prev, buffer_stats: msg.bufferStats as Metrics['buffer_stats'] }));
        }
        break;
      }

      case 'test_complete': {
        const m = msg.metrics as Metrics;
        setMetrics(m);
        setTestRunning(false);
        setProgress(1);

        saveTestResult({
          id: Date.now().toString(),
          timestamp: Date.now(),
          metrics: m as Record<string, unknown>,
          mitigationEnabled: msg.mitigationEnabled as boolean,
        });
        break;
      }

      case 'mitigation_status':
        setMitigationEnabled(msg.enabled as boolean);
        break;

      case 'experiment_created':
      case 'experiment_results':
        experiment.handleExperimentMessage(msg as Record<string, unknown>);

        if (msg.type === 'experiment_results' && msg.testPhase === 'B') {
          saveExperiment({
            id: Date.now().toString(),
            experimentId: experiment.experimentId || '',
            timestamp: Date.now(),
            config: experiment.config as unknown as Record<string, unknown> || {},
            testAResults: experiment.testAResults,
            testBResults: msg.results as Record<string, unknown>,
          });
        }
        break;
    }
  }, [experiment]);

  const { connectionState, send } = useWebSocket({
    url: wsUrl,
    sessionId: session?.sessionId || null,
    onMessage,
  });

  // Draw charts
  useEffect(() => {
    drawChart(rttCanvasRef.current, rttHistory, '#6366f1', '#22d3ee', 'RTT (ms)');
  }, [rttHistory]);

  useEffect(() => {
    drawChart(varCanvasRef.current, variationHistory, '#10b981', '#f59e0b', 'Variation (ms)');
  }, [variationHistory]);

  // Actions
  const handleStartTest = () => {
    setTestRunning(true);
    setProgress(0);
    setRttHistory([]);
    setVariationHistory([]);
    setMetrics({});
    send({ type: 'start_test' });
  };

  const handleStopTest = () => {
    send({ type: 'stop_test' });
    setTestRunning(false);
  };

  const handleToggleMitigation = () => {
    send({ type: mitigationEnabled ? 'disable_mitigation' : 'enable_mitigation' });
  };

  const handleConfigureImpairment = () => {
    send({
      type: 'configure_impairment',
      config: {
        baseDelayMs: baseDelay,
        randomJitterMs: randomJitter,
        packetLossPercent: packetLoss,
      },
    });
  };

  const handleStartExperiment = async () => {
    try {
      setRttHistory([]);
      setVariationHistory([]);
      setMetrics({});
      const exp = await experiment.startExperiment({
        packetCount: 200,
        baseDelayMs: baseDelay,
        randomJitterMs: randomJitter,
        packetLossPercent: packetLoss,
      });
      if (exp) {
        send({
          type: 'start_experiment',
          config: {
            packetCount: 200,
            baseDelayMs: baseDelay,
            randomJitterMs: randomJitter,
            packetLossPercent: packetLoss,
          },
        });
      }
    } catch {
      // error handled in hook
    }
  };

  const impairmentLocked = experiment.isRunning;

  return (
    <div className="section animate-in">
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          <span style={{ background: 'var(--gradient-hero)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Network Jitter Dashboard
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
          Real-time UDP measurement · RTT variation analysis · Application-level jitter mitigation
        </p>

        {/* Status Bar */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem' }}>
          <div className="badge badge-info">
            <span className={`status-dot ${connectionState === 'connected' ? 'connected' : 'disconnected'}`} />
            WS: {connectionState}
          </div>
          <div className={`badge ${agentConnected ? 'badge-success' : 'badge-danger'}`}>
            <span className={`status-dot ${agentConnected ? 'connected' : 'disconnected'}`} />
            Agent: {agentConnected ? 'Connected' : 'Not Connected'}
          </div>
          {mitigationEnabled && (
            <div className="badge badge-warning">🛡️ Mitigation Active</div>
          )}
        </div>

        {!agentConnected && (
          <div style={{ marginTop: '1rem' }}>
            <Link href="/setup" className="btn btn-primary">
              ⚡ Setup Agent
            </Link>
          </div>
        )}
      </div>

      {/* Experiment Lock Banner */}
      {experiment.isRunning && (
        <div className="experiment-banner" style={{ marginBottom: '1.5rem' }}>
          <span className="lock-icon">🔒</span>
          <div>
            <strong>Paired Experiment Running: {experiment.experimentId}</strong>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
              Impairment controls locked. {experiment.state === 'test_a_running' ? 'Test A (No Mitigation)' : experiment.state === 'test_b_running' ? 'Test B (With Mitigation)' : experiment.state} in progress...
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <span className="stat-label">Avg RTT</span>
          <span className="stat-value">{metrics.avg_rtt?.toFixed(1) ?? '—'}</span>
          <span className="stat-unit">ms</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">RTT Variation</span>
          <span className="stat-value">{metrics.avg_rtt_variation?.toFixed(2) ?? '—'}</span>
          <span className="stat-unit">ms (jitter)</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Packet Loss</span>
          <span className="stat-value">{metrics.packet_loss_percent?.toFixed(1) ?? '—'}</span>
          <span className="stat-unit">%</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">P95 RTT</span>
          <span className="stat-value">{metrics.p95_rtt?.toFixed(1) ?? '—'}</span>
          <span className="stat-unit">ms</span>
        </div>
        {mitigationEnabled && metrics.buffer_stats && (
          <>
            <div className="stat-card">
              <span className="stat-label">Effective Delivery Var</span>
              <span className="stat-value">{metrics.buffer_stats.effective_delivery_variation?.toFixed(2) ?? '—'}</span>
              <span className="stat-unit">ms (buffered)</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Buffer Depth</span>
              <span className="stat-value">{metrics.buffer_stats.target_depth_ms?.toFixed(1) ?? '—'}</span>
              <span className="stat-unit">ms</span>
            </div>
          </>
        )}
      </div>

      {/* Charts */}
      <div className="dashboard-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            📊 RTT (Round-Trip Time)
          </h3>
          <div className="chart-container">
            <canvas ref={rttCanvasRef} />
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            📈 RTT Variation (Jitter)
          </h3>
          <div className="chart-container">
            <canvas ref={varCanvasRef} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="dashboard-grid">
        {/* Left: Test Controls */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>🎮 Test Controls</h3>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleStartTest}
              disabled={!agentConnected || testRunning || experiment.isRunning}
            >
              ▶ Start Test
            </button>
            <button
              className="btn btn-danger"
              onClick={handleStopTest}
              disabled={!testRunning}
            >
              ⏹ Stop
            </button>
            <button
              className="btn btn-success btn-lg"
              onClick={handleStartExperiment}
              disabled={!agentConnected || testRunning || experiment.isRunning}
            >
              🔬 Run Paired Experiment
            </button>
          </div>

          {/* Progress */}
          {(testRunning || experiment.isRunning) && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                <div style={{
                  height: '100%',
                  width: `${progress * 100}%`,
                  background: 'var(--gradient-hero)',
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {Math.round(progress * 100)}%
              </span>
            </div>
          )}

          {/* Mitigation Toggle */}
          <div className="toggle" onClick={handleToggleMitigation} style={{ marginBottom: '0.5rem' }}>
            <div className={`toggle-track ${mitigationEnabled ? 'active' : ''}`} />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              Adaptive Jitter Buffer {mitigationEnabled ? '(ON)' : '(OFF)'}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Application-level mitigation only. Does not reduce physical network jitter.
          </p>
        </div>

        {/* Right: Impairment Controls */}
        <div className="glass-card" style={{ padding: '1.5rem', opacity: impairmentLocked ? 0.5 : 1 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>
            🌊 Network Impairment {impairmentLocked && '🔒'}
          </h3>
          {impairmentLocked && (
            <p style={{ fontSize: '0.75rem', color: 'var(--accent-amber)', marginBottom: '1rem' }}>
              Controls locked during paired experiment.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="slider-group">
              <label>Base Delay <span>{baseDelay} ms</span></label>
              <input type="range" min={0} max={200} value={baseDelay}
                onChange={e => setBaseDelay(Number(e.target.value))} disabled={impairmentLocked} />
            </div>
            <div className="slider-group">
              <label>Random Jitter <span>±{randomJitter} ms</span></label>
              <input type="range" min={0} max={100} value={randomJitter}
                onChange={e => setRandomJitter(Number(e.target.value))} disabled={impairmentLocked} />
            </div>
            <div className="slider-group">
              <label>Packet Loss <span>{packetLoss}%</span></label>
              <input type="range" min={0} max={30} value={packetLoss}
                onChange={e => setPacketLoss(Number(e.target.value))} disabled={impairmentLocked} />
            </div>

            <button
              className="btn btn-ghost"
              onClick={handleConfigureImpairment}
              disabled={impairmentLocked || !agentConnected}
            >
              Apply Impairment
            </button>
          </div>
        </div>
      </div>

      {/* Extra Metrics */}
      {Object.keys(metrics).length > 0 && (
        <div className="glass-card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
          <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>📋 Detailed Metrics</h3>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <MiniStat label="Min RTT" value={metrics.min_rtt} unit="ms" />
            <MiniStat label="Max RTT" value={metrics.max_rtt} unit="ms" />
            <MiniStat label="Stdev" value={metrics.stdev_rtt} unit="ms" />
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
    <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
        {value !== undefined ? value.toFixed(2) : '—'}
        {unit && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

// Simple canvas chart renderer
function drawChart(
  canvas: HTMLCanvasElement | null,
  data: number[],
  color1: string,
  color2: string,
  label: string
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // Clear
  ctx.clearRect(0, 0, w, h);

  if (data.length < 2) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Waiting for ${label} data...`, w / 2, h / 2);
    return;
  }

  const maxVal = Math.max(...data) * 1.2 || 1;
  const minVal = 0;

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    const val = maxVal - (maxVal * i) / 4;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), padding.left - 8, y + 3);
  }

  // Draw line
  const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  for (let i = 0; i < data.length; i++) {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + chartH - ((data[i] - minVal) / (maxVal - minVal)) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Fill area
  const areaGradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
  areaGradient.addColorStop(0, color1 + '30');
  areaGradient.addColorStop(1, 'transparent');

  ctx.lineTo(padding.left + chartW, padding.top + chartH);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.closePath();
  ctx.fillStyle = areaGradient;
  ctx.fill();

  // Label
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, w / 2, h - 5);
}
