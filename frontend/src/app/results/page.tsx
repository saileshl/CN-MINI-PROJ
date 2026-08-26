'use client';

import { useState, useEffect } from 'react';
import { getExperiments, getTestResults, clearExperiments, clearTestResults, exportToJSON, ExperimentRecord, TestResult } from '@/lib/storage';

export default function ResultsPage() {
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [activeTab, setActiveTab] = useState<'experiments' | 'tests'>('experiments');

  useEffect(() => {
    setExperiments(getExperiments());
    setTestResults(getTestResults());
  }, []);

  const handleClearAll = () => {
    if (confirm('Clear all saved results? This cannot be undone.')) {
      clearExperiments();
      clearTestResults();
      setExperiments([]);
      setTestResults([]);
    }
  };

  const handleExport = () => {
    exportToJSON(
      { experiments, testResults, exportedAt: new Date().toISOString() },
      `netjitter_results_${Date.now()}.json`
    );
  };

  return (
    <div className="section animate-in">
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          <span style={{ background: 'var(--gradient-hero)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Test Results
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Results are stored locally in your browser (localStorage). Not synced to any server.
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <button className="btn btn-primary" onClick={handleExport}>
          📥 Export JSON
        </button>
        <button className="btn btn-ghost" onClick={handleClearAll}>
          🗑️ Clear All
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ justifyContent: 'center' }}>
        <div className={`tab ${activeTab === 'experiments' ? 'active' : ''}`} onClick={() => setActiveTab('experiments')}>
          🔬 Paired Experiments ({experiments.length})
        </div>
        <div className={`tab ${activeTab === 'tests' ? 'active' : ''}`} onClick={() => setActiveTab('tests')}>
          📊 Ad-hoc Tests ({testResults.length})
        </div>
      </div>

      {/* Experiments */}
      {activeTab === 'experiments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {experiments.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.125rem' }}>No experiments yet</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Run a Paired Experiment from the Dashboard to compare before/after mitigation.
              </p>
            </div>
          ) : (
            experiments.map((exp) => (
              <ExperimentCard key={exp.id} experiment={exp} />
            ))
          )}
        </div>
      )}

      {/* Tests */}
      {activeTab === 'tests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {testResults.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.125rem' }}>No test results yet</p>
            </div>
          ) : (
            testResults.map((result) => (
              <TestResultCard key={result.id} result={result} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ExperimentCard({ experiment }: { experiment: ExperimentRecord }) {
  const config = experiment.config as Record<string, unknown>;
  const testA = experiment.testAResults as Record<string, unknown> | null;
  const testB = experiment.testBResults as Record<string, unknown> | null;
  const bufferStats = (testB as Record<string, unknown>)?.buffer_stats as Record<string, unknown> | undefined;

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
            {experiment.experimentId}
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {new Date(experiment.timestamp).toLocaleString()}
          </p>
        </div>
        <span className="badge badge-info">Both tests used the same impairment schedule</span>
      </div>

      {/* Config */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span className="badge badge-warning">Base Delay: {String(config?.baseDelayMs ?? '?')}ms</span>
        <span className="badge badge-warning">Jitter: ±{String(config?.randomJitterMs ?? '?')}ms</span>
        <span className="badge badge-warning">Loss: {String(config?.packetLossPercent ?? '?')}%</span>
        <span className="badge badge-info">Packets: {String(config?.packetCount ?? '?')}</span>
      </div>

      {/* Comparison Table */}
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Test A (No Buffer)</th>
            <th>Test B (With Buffer)</th>
          </tr>
        </thead>
        <tbody>
          <CompRow label="Avg RTT" a={testA?.avg_rtt} b={testB?.avg_rtt} unit="ms" />
          <CompRow label="Raw RTT Variation" a={testA?.avg_rtt_variation} b={testB?.avg_rtt_variation} unit="ms" note="should be similar" />
          <CompRow label="Effective Delivery Var." a={null} b={bufferStats?.effective_delivery_variation} unit="ms" note="should be lower" highlight />
          <CompRow label="Packet Loss" a={testA?.packet_loss_percent} b={testB?.packet_loss_percent} unit="%" />
          <CompRow label="Min RTT" a={testA?.min_rtt} b={testB?.min_rtt} unit="ms" />
          <CompRow label="Max RTT" a={testA?.max_rtt} b={testB?.max_rtt} unit="ms" />
          <CompRow label="P95 RTT" a={testA?.p95_rtt} b={testB?.p95_rtt} unit="ms" />
          <CompRow label="Buffer Depth" a={null} b={bufferStats?.target_depth_ms} unit="ms" />
          <CompRow label="Dropped (Late)" a={null} b={bufferStats?.packets_dropped_late} />
          <CompRow label="Missing" a={null} b={bufferStats?.packets_missing} />
        </tbody>
      </table>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', fontStyle: 'italic' }}>
        Raw network metrics (RTT, RTT Variation) reflect actual network conditions. Effective delivery variation reflects the application-level improvement from the adaptive jitter buffer. The buffer does not reduce physical network jitter.
      </p>
    </div>
  );
}

function CompRow({ label, a, b, unit, note, highlight }: {
  label: string;
  a: unknown;
  b: unknown;
  unit?: string;
  note?: string;
  highlight?: boolean;
}) {
  const format = (v: unknown) => {
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'number') return v.toFixed(2) + (unit ? ` ${unit}` : '');
    return String(v);
  };

  return (
    <tr>
      <td style={{ color: highlight ? 'var(--accent-cyan)' : undefined, fontWeight: highlight ? 600 : undefined }}>
        {label}
        {note && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>({note})</span>}
      </td>
      <td>{format(a)}</td>
      <td style={{ color: highlight ? 'var(--accent-green)' : undefined }}>{format(b)}</td>
    </tr>
  );
}

function TestResultCard({ result }: { result: TestResult }) {
  const m = result.metrics as Record<string, unknown>;
  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {new Date(result.timestamp).toLocaleString()}
        </span>
        <span className={`badge ${result.mitigationEnabled ? 'badge-success' : 'badge-info'}`}>
          {result.mitigationEnabled ? '🛡️ Mitigation ON' : 'Raw'}
        </span>
      </div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <MiniStat label="Avg RTT" value={m.avg_rtt} unit="ms" />
        <MiniStat label="RTT Variation" value={m.avg_rtt_variation} unit="ms" />
        <MiniStat label="Loss" value={m.packet_loss_percent} unit="%" />
        <MiniStat label="P95" value={m.p95_rtt} unit="ms" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: unknown; unit?: string }) {
  const v = typeof value === 'number' ? value.toFixed(2) : '—';
  return (
    <div style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
        {v}{unit && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}> {unit}</span>}
      </div>
    </div>
  );
}
