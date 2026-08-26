/**
 * Experiment hook — manages paired A/B experiment lifecycle.
 * Creates experiment, locks impairment, runs Test A → Test B.
 */
'use client';

import { useState, useCallback } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export type ExperimentState =
  | 'idle'
  | 'configuring'
  | 'test_a_running'
  | 'test_a_done'
  | 'test_b_running'
  | 'complete';

export interface ExperimentConfig {
  packetCount: number;
  baseDelayMs: number;
  randomJitterMs: number;
  packetLossPercent: number;
  seed?: number;
}

export interface ExperimentResults {
  experimentId: string;
  config: ExperimentConfig;
  testAResults: Record<string, unknown> | null;
  testBResults: Record<string, unknown> | null;
}

export function useExperiment() {
  const [state, setState] = useState<ExperimentState>('idle');
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [config, setConfig] = useState<ExperimentConfig | null>(null);
  const [testAResults, setTestAResults] = useState<Record<string, unknown> | null>(null);
  const [testBResults, setTestBResults] = useState<Record<string, unknown> | null>(null);

  const startExperiment = useCallback(async (expConfig: ExperimentConfig) => {
    setState('configuring');
    setConfig(expConfig);
    setTestAResults(null);
    setTestBResults(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/experiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expConfig),
      });
      if (!res.ok) throw new Error('Failed to create experiment');
      const data = await res.json();
      setExperimentId(data.experimentId);
      return data;
    } catch (err) {
      setState('idle');
      throw err;
    }
  }, []);

  const handleExperimentMessage = useCallback((msg: Record<string, unknown>) => {
    if (msg.type === 'experiment_created') {
      setState('test_a_running');
    } else if (msg.type === 'experiment_results') {
      if (msg.testPhase === 'A') {
        setTestAResults(msg.results as Record<string, unknown>);
        setState('test_a_done');
        // Brief pause then Test B starts automatically
        setTimeout(() => setState('test_b_running'), 500);
      } else if (msg.testPhase === 'B') {
        setTestBResults(msg.results as Record<string, unknown>);
        setState('complete');
      }
    }
  }, []);

  const resetExperiment = useCallback(() => {
    setState('idle');
    setExperimentId(null);
    setConfig(null);
    setTestAResults(null);
    setTestBResults(null);
  }, []);

  return {
    state,
    experimentId,
    config,
    testAResults,
    testBResults,
    startExperiment,
    handleExperimentMessage,
    resetExperiment,
    isRunning: state !== 'idle' && state !== 'complete',
  };
}
