/**
 * Demo Mode — Simulated Jitter Measurement Engine
 * =================================================
 * Generates realistic jitter data directly in the browser when
 * no backend is available. Used for the Vercel deployment demo.
 *
 * This does NOT measure real network conditions.
 * It demonstrates the dashboard, charts, and experiment flow
 * with realistic simulated data.
 */

// Mulberry32 PRNG — matches backend's ExperimentManager
function mulberry32(seed: number) {
  let s = seed & 0xFFFFFFFF;
  return () => {
    s = (s + 0x6D2B79F5) & 0xFFFFFFFF;
    let t = (s ^ (s >>> 15)) * (1 | s) & 0xFFFFFFFF;
    t = ((t + ((t ^ (t >>> 7)) * (61 | t) & 0xFFFFFFFF)) ^ t) & 0xFFFFFFFF;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoConfig {
  packetCount: number;
  baseDelayMs: number;
  randomJitterMs: number;
  packetLossPercent: number;
  packetIntervalMs: number;
  seed?: number;
}

export interface DemoPacket {
  seq: number;
  rtt: number | null;
  status: 'received' | 'timeout';
  appliedDelay: number;
}

export interface DemoMetrics {
  avg_rtt: number;
  min_rtt: number;
  max_rtt: number;
  stdev_rtt: number;
  p50_rtt: number;
  p95_rtt: number;
  p99_rtt: number;
  avg_rtt_variation: number;
  packets_sent: number;
  packets_received: number;
  packet_loss_percent: number;
  sample_count: number;
  buffer_stats?: {
    target_depth_ms: number;
    effective_delivery_variation: number;
    packets_dropped_late: number;
    packets_missing: number;
    estimated_variation_ms: number;
    packets_received: number;
    packets_played: number;
  };
}

function percentile(sorted: number[], pct: number): number {
  if (!sorted.length) return 0;
  const k = (sorted.length - 1) * pct / 100;
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sorted[Math.round(k)];
  return sorted[f] * (c - k) + sorted[c] * (k - f);
}

function calcMetrics(rttValues: number[]): Omit<DemoMetrics, 'packets_sent' | 'packets_received' | 'packet_loss_percent' | 'sample_count'> {
  if (!rttValues.length) {
    return { avg_rtt: 0, min_rtt: 0, max_rtt: 0, stdev_rtt: 0, p50_rtt: 0, p95_rtt: 0, p99_rtt: 0, avg_rtt_variation: 0 };
  }
  const avg = rttValues.reduce((a, b) => a + b, 0) / rttValues.length;
  const sorted = [...rttValues].sort((a, b) => a - b);
  const variance = rttValues.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (rttValues.length - 1 || 1);

  const variations: number[] = [];
  for (let i = 1; i < rttValues.length; i++) {
    variations.push(Math.abs(rttValues[i] - rttValues[i - 1]));
  }
  const avgVar = variations.length ? variations.reduce((a, b) => a + b, 0) / variations.length : 0;

  return {
    avg_rtt: Math.round(avg * 100) / 100,
    min_rtt: Math.round(sorted[0] * 100) / 100,
    max_rtt: Math.round(sorted[sorted.length - 1] * 100) / 100,
    stdev_rtt: Math.round(Math.sqrt(variance) * 100) / 100,
    p50_rtt: Math.round(percentile(sorted, 50) * 100) / 100,
    p95_rtt: Math.round(percentile(sorted, 95) * 100) / 100,
    p99_rtt: Math.round(percentile(sorted, 99) * 100) / 100,
    avg_rtt_variation: Math.round(avgVar * 100) / 100,
  };
}

/**
 * Generate a complete simulated test run.
 */
export function generateDemoTest(config: DemoConfig, mitigationEnabled: boolean): {
  packets: DemoPacket[];
  metrics: DemoMetrics;
} {
  const rng = mulberry32(config.seed ?? Date.now());
  const packets: DemoPacket[] = [];
  const rttValues: number[] = [];
  let received = 0;

  for (let seq = 1; seq <= config.packetCount; seq++) {
    // Packet loss check
    if (rng() * 100 < config.packetLossPercent) {
      packets.push({ seq, rtt: null, status: 'timeout', appliedDelay: 0 });
      continue;
    }

    // Base RTT (simulated network: ~5-15ms base + config delay)
    const baseNetwork = 5 + rng() * 10;
    const jitterOffset = (rng() * 2 - 1) * config.randomJitterMs;
    const appliedDelay = Math.max(0, config.baseDelayMs + jitterOffset);
    const rtt = baseNetwork + appliedDelay;

    rttValues.push(rtt);
    received++;
    packets.push({ seq, rtt: Math.round(rtt * 100) / 100, status: 'received', appliedDelay: Math.round(appliedDelay * 100) / 100 });
  }

  const baseMetrics = calcMetrics(rttValues);
  const lossPercent = ((config.packetCount - received) / config.packetCount) * 100;

  const metrics: DemoMetrics = {
    ...baseMetrics,
    packets_sent: config.packetCount,
    packets_received: received,
    packet_loss_percent: Math.round(lossPercent * 100) / 100,
    sample_count: rttValues.length,
  };

  // Simulate buffer effect if mitigation enabled
  if (mitigationEnabled) {
    // Buffer smooths delivery variation significantly
    // Effective variation is much lower than raw
    const rawVar = baseMetrics.avg_rtt_variation;
    const effectiveVar = Math.max(0.1, rawVar * (0.05 + rng() * 0.1)); // 5-15% of raw
    const bufferDepth = Math.min(200, Math.max(20, rawVar * 2));

    metrics.buffer_stats = {
      target_depth_ms: Math.round(bufferDepth * 100) / 100,
      effective_delivery_variation: Math.round(effectiveVar * 100) / 100,
      packets_dropped_late: Math.floor(rng() * 3),
      packets_missing: Math.floor(rng() * 5),
      estimated_variation_ms: Math.round(rawVar * 100) / 100,
      packets_received: received,
      packets_played: received - Math.floor(rng() * 3),
    };
  }

  return { packets, metrics };
}

/**
 * Run a simulated paired A/B experiment.
 */
export function generateDemoExperiment(config: DemoConfig): {
  testA: { packets: DemoPacket[]; metrics: DemoMetrics };
  testB: { packets: DemoPacket[]; metrics: DemoMetrics };
} {
  const seed = config.seed ?? Math.floor(Math.random() * 999999);

  // Test A: No mitigation — same seed
  const testA = generateDemoTest({ ...config, seed }, false);

  // Test B: With mitigation — same seed (same impairment)
  const testB = generateDemoTest({ ...config, seed }, true);

  return { testA, testB };
}

/**
 * Stream simulated test data with realistic timing.
 * Calls onBatch every ~500ms with a batch of packets.
 * Calls onComplete when done.
 */
export function streamDemoTest(
  config: DemoConfig,
  mitigationEnabled: boolean,
  onBatch: (batch: DemoPacket[], batchMetrics: DemoMetrics, progress: number) => void,
  onComplete: (metrics: DemoMetrics) => void,
): { cancel: () => void } {
  const { packets, metrics } = generateDemoTest(config, mitigationEnabled);
  const batchSize = 10;
  let batchIndex = 0;
  let cancelled = false;

  function sendBatch() {
    if (cancelled) return;
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, packets.length);
    const batch = packets.slice(start, end);
    const progress = end / packets.length;

    // Calc batch metrics
    const batchRtts = batch.filter(p => p.rtt !== null).map(p => p.rtt as number);
    const batchM = batchRtts.length ? calcMetrics(batchRtts) : calcMetrics([0]);

    onBatch(batch, {
      ...batchM,
      packets_sent: end,
      packets_received: packets.slice(0, end).filter(p => p.status === 'received').length,
      packet_loss_percent: 0,
      sample_count: batchRtts.length,
      ...(mitigationEnabled ? { buffer_stats: metrics.buffer_stats } : {}),
    }, progress);

    batchIndex++;
    if (end < packets.length) {
      setTimeout(sendBatch, 300 + Math.random() * 200);
    } else {
      setTimeout(() => {
        if (!cancelled) onComplete(metrics);
      }, 200);
    }
  }

  setTimeout(sendBatch, 500);

  return {
    cancel: () => { cancelled = true; },
  };
}
