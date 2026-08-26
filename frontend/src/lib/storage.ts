/**
 * Client-local storage for test results and experiments.
 * Uses localStorage — clearly documented as browser-local, no server persistence.
 */

const RESULTS_KEY = 'networkjitter_results';
const EXPERIMENTS_KEY = 'networkjitter_experiments';

export interface TestResult {
  id: string;
  timestamp: number;
  metrics: Record<string, unknown>;
  mitigationEnabled: boolean;
}

export interface ExperimentRecord {
  id: string;
  experimentId: string;
  timestamp: number;
  config: Record<string, unknown>;
  testAResults: Record<string, unknown> | null;
  testBResults: Record<string, unknown> | null;
}

// -- Test Results --

export function saveTestResult(result: TestResult): void {
  if (typeof window === 'undefined') return;
  const results = getTestResults();
  results.unshift(result);
  // Keep last 50
  if (results.length > 50) results.length = 50;
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

export function getTestResults(): TestResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(RESULTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function clearTestResults(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(RESULTS_KEY);
}

// -- Experiments --

export function saveExperiment(experiment: ExperimentRecord): void {
  if (typeof window === 'undefined') return;
  const experiments = getExperiments();
  experiments.unshift(experiment);
  if (experiments.length > 20) experiments.length = 20;
  localStorage.setItem(EXPERIMENTS_KEY, JSON.stringify(experiments));
}

export function getExperiments(): ExperimentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(EXPERIMENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function clearExperiments(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(EXPERIMENTS_KEY);
}

// -- Export --

export function exportToJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
