// ============================================================
// Experiment Manager — Deterministic Paired A/B Experiments
// ============================================================
// Creates reproducible impairment schedules for paired tests.
// Test A and Test B replay the EXACT same per-packet events.
// ============================================================

const { v4: uuidv4 } = require('uuid');

class ExperimentManager {
  constructor() {
    this.experiments = new Map(); // experimentId -> ExperimentState
  }

  // ----------------------------------------------------------
  // Create a new paired experiment with deterministic schedule
  // ----------------------------------------------------------
  createExperiment(config) {
    const {
      packetCount = 200,
      baseDelayMs = 30,
      randomJitterMs = 40,
      packetLossPercent = 5,
      reorderPercent = 0,
      seed = null,
    } = config;

    const experimentId = 'EXP-' + uuidv4().slice(0, 8).toUpperCase();
    const actualSeed = seed !== null ? seed : Math.floor(Math.random() * 2147483647);

    // Generate the deterministic impairment schedule
    const schedule = this._generateSchedule({
      packetCount,
      baseDelayMs,
      randomJitterMs,
      packetLossPercent,
      reorderPercent,
      seed: actualSeed,
    });

    const experiment = {
      experimentId,
      config: {
        packetCount,
        baseDelayMs,
        randomJitterMs,
        packetLossPercent,
        reorderPercent,
        seed: actualSeed,
      },
      schedule,
      state: 'created',  // created | test_a_running | test_a_done | test_b_running | complete
      testAResults: null,
      testBResults: null,
      createdAt: Date.now(),
    };

    this.experiments.set(experimentId, experiment);

    return {
      experimentId,
      config: experiment.config,
      schedule,
    };
  }

  // ----------------------------------------------------------
  // Get experiment by ID
  // ----------------------------------------------------------
  getExperiment(experimentId) {
    return this.experiments.get(experimentId) || null;
  }

  // ----------------------------------------------------------
  // Update experiment state
  // ----------------------------------------------------------
  updateState(experimentId, state) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return false;
    exp.state = state;
    return true;
  }

  // ----------------------------------------------------------
  // Store test results
  // ----------------------------------------------------------
  storeTestAResults(experimentId, results) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return false;
    exp.testAResults = results;
    exp.state = 'test_a_done';
    return true;
  }

  storeTestBResults(experimentId, results) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return false;
    exp.testBResults = results;
    exp.state = 'complete';
    return true;
  }

  // ----------------------------------------------------------
  // Deterministic Schedule Generation
  // ----------------------------------------------------------
  // Uses a seeded PRNG to produce identical schedules for the
  // same seed. Each packet gets: { seq, delayMs, drop, reorder }
  // ----------------------------------------------------------
  _generateSchedule({ packetCount, baseDelayMs, randomJitterMs, packetLossPercent, reorderPercent, seed }) {
    const rng = this._createSeededRNG(seed);
    const schedule = [];

    for (let seq = 1; seq <= packetCount; seq++) {
      const lossRoll = rng() * 100;
      const drop = lossRoll < packetLossPercent;

      // Random jitter: uniform distribution in [-randomJitterMs, +randomJitterMs]
      const jitterOffset = (rng() * 2 - 1) * randomJitterMs;
      const delayMs = Math.max(0, Math.round(baseDelayMs + jitterOffset));

      const reorderRoll = rng() * 100;
      const reorder = !drop && reorderRoll < reorderPercent;

      // If reordering, add extra delay to push it behind later packets
      const reorderExtraMs = reorder ? Math.round(rng() * randomJitterMs * 2) : 0;

      schedule.push({
        seq,
        delayMs: drop ? 0 : delayMs + reorderExtraMs,
        drop,
        reorder,
      });
    }

    return schedule;
  }

  // ----------------------------------------------------------
  // Seeded PRNG (Mulberry32)
  // ----------------------------------------------------------
  // Fast, deterministic, produces identical sequences for same seed
  // ----------------------------------------------------------
  _createSeededRNG(seed) {
    let s = seed | 0;
    return function () {
      s |= 0;
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ----------------------------------------------------------
  // Cleanup old experiments
  // ----------------------------------------------------------
  cleanOldExperiments(maxAgeMs = 3600000) {
    const now = Date.now();
    for (const [id, exp] of this.experiments) {
      if (now - exp.createdAt > maxAgeMs) {
        this.experiments.delete(id);
      }
    }
  }
}

module.exports = ExperimentManager;
