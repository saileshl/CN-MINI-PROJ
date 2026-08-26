// ============================================================
// Backend Tests — Session Manager, Server, Pairing, Isolation
// ============================================================

const SessionManager = require('../src/sessionManager');
const ExperimentManager = require('../src/experimentManager');

// ----------------------------------------------------------
// Session Manager Tests
// ----------------------------------------------------------
describe('SessionManager', () => {
  let sm;

  beforeEach(() => {
    sm = new SessionManager({ codeExpiry: 5000 }); // 5s for tests
  });

  afterEach(() => {
    sm.destroy();
  });

  // -- Session Creation --
  test('creates a session with pairing code', () => {
    const { sessionId, pairingCode, expiresAt } = sm.createSession();
    expect(sessionId).toBeTruthy();
    expect(pairingCode).toHaveLength(6);
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  test('generates unique pairing codes', () => {
    const codes = new Set();
    for (let i = 0; i < 50; i++) {
      const { pairingCode } = sm.createSession();
      codes.add(pairingCode);
    }
    expect(codes.size).toBe(50);
  });

  // -- First-Time Pairing --
  test('pairs agent with valid pairing code', () => {
    const { pairingCode } = sm.createSession();
    const mockWs = createMockWs();

    const result = sm.pairAgent(pairingCode, mockWs);
    expect(result.success).toBe(true);
    expect(result.agentId).toBeTruthy();
    expect(result.agentToken).toBeTruthy();
    expect(result.agentToken).toHaveLength(64); // 32 bytes hex
  });

  test('rejects invalid pairing code', () => {
    const mockWs = createMockWs();
    const result = sm.pairAgent('BADCOD', mockWs);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  test('rejects expired pairing code', () => {
    const sm2 = new SessionManager({ codeExpiry: 1 }); // 1ms expiry
    const { pairingCode } = sm2.createSession();
    const mockWs = createMockWs();

    // Wait for expiry
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = sm2.pairAgent(pairingCode, mockWs);
        expect(result.success).toBe(false);
        expect(result.error).toContain('expired');
        sm2.destroy();
        resolve();
      }, 10);
    });
  });

  test('pairing code is consumed after use', () => {
    const { pairingCode } = sm.createSession();
    const mockWs1 = createMockWs();
    const mockWs2 = createMockWs();

    const result1 = sm.pairAgent(pairingCode, mockWs1);
    expect(result1.success).toBe(true);

    const result2 = sm.pairAgent(pairingCode, mockWs2);
    expect(result2.success).toBe(false);
  });

  // -- Persistent Token Reconnect --
  test('agent reconnects with persistent token', () => {
    const { pairingCode } = sm.createSession();
    const mockWs1 = createMockWs();

    const pairResult = sm.pairAgent(pairingCode, mockWs1);
    expect(pairResult.success).toBe(true);

    // Simulate disconnect + reconnect
    const mockWs2 = createMockWs();
    const authResult = sm.authenticateAgent(pairResult.agentToken, mockWs2);
    expect(authResult.success).toBe(true);
    expect(authResult.agentId).toBe(pairResult.agentId);
  });

  test('rejects invalid token', () => {
    const mockWs = createMockWs();
    const result = sm.authenticateAgent('invalid_token_here', mockWs);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  // -- Token Revocation --
  test('revokes agent token', () => {
    const { sessionId, pairingCode } = sm.createSession();
    const mockWs = createMockWs();

    const pairResult = sm.pairAgent(pairingCode, mockWs);
    expect(pairResult.success).toBe(true);

    const revokeResult = sm.revokeAgent(sessionId);
    expect(revokeResult.success).toBe(true);

    // Token should no longer work
    const mockWs2 = createMockWs();
    const authResult = sm.authenticateAgent(pairResult.agentToken, mockWs2);
    expect(authResult.success).toBe(false);
  });

  // -- Session Isolation --
  test('agent A data does not reach dashboard B', () => {
    // Create two sessions
    const session1 = sm.createSession();
    const session2 = sm.createSession();

    const agentWs1 = createMockWs();
    const agentWs2 = createMockWs();
    const dashWs1 = createMockWs();
    const dashWs2 = createMockWs();

    sm.pairAgent(session1.pairingCode, agentWs1);
    sm.pairAgent(session2.pairingCode, agentWs2);
    sm.connectDashboard(session1.sessionId, dashWs1);
    sm.connectDashboard(session2.sessionId, dashWs2);

    // Clear previous messages (from connect notifications)
    dashWs1.sentMessages = [];
    dashWs2.sentMessages = [];

    // Agent 1 sends data
    sm.routeToDashboard(agentWs1, { type: 'measurement', data: 'from_agent_1' });

    // Only dashboard 1 should receive it
    expect(dashWs1.sentMessages).toHaveLength(1);
    expect(dashWs2.sentMessages).toHaveLength(0);
    expect(JSON.parse(dashWs1.sentMessages[0]).data).toBe('from_agent_1');
  });

  test('dashboard A command does not reach agent B', () => {
    const session1 = sm.createSession();
    const session2 = sm.createSession();

    const agentWs1 = createMockWs();
    const agentWs2 = createMockWs();

    sm.pairAgent(session1.pairingCode, agentWs1);
    sm.pairAgent(session2.pairingCode, agentWs2);

    // Clear previous messages
    agentWs1.sentMessages = [];
    agentWs2.sentMessages = [];

    // Dashboard 1 sends command
    sm.routeToAgent(session1.sessionId, { type: 'start_test' });

    // Only agent 1 should receive it
    expect(agentWs1.sentMessages).toHaveLength(1);
    expect(agentWs2.sentMessages).toHaveLength(0);
  });

  // -- Disconnect Handling --
  test('handles agent disconnect without losing identity', () => {
    const { sessionId, pairingCode } = sm.createSession();
    const agentWs = createMockWs();
    const dashWs = createMockWs();

    sm.pairAgent(pairingCode, agentWs);
    sm.connectDashboard(sessionId, dashWs);
    dashWs.sentMessages = [];

    // Disconnect
    sm.handleAgentDisconnect(agentWs);

    // Dashboard should be notified
    expect(dashWs.sentMessages.length).toBeGreaterThan(0);
    const msg = JSON.parse(dashWs.sentMessages[0]);
    expect(msg.type).toBe('agent_status');
    expect(msg.status).toBe('disconnected');

    // Session should still have agent identity (for reconnect)
    const session = sm.getSession(sessionId);
    expect(session.agentId).toBeTruthy();
    expect(session.paired).toBe(true); // identity preserved
  });
});

// ----------------------------------------------------------
// Experiment Manager Tests
// ----------------------------------------------------------
describe('ExperimentManager', () => {
  let em;

  beforeEach(() => {
    em = new ExperimentManager();
  });

  test('creates experiment with deterministic schedule', () => {
    const exp = em.createExperiment({
      packetCount: 100,
      baseDelayMs: 30,
      randomJitterMs: 40,
      packetLossPercent: 5,
      seed: 12345,
    });

    expect(exp.experimentId).toMatch(/^EXP-/);
    expect(exp.schedule).toHaveLength(100);
    expect(exp.config.seed).toBe(12345);
  });

  test('same seed produces identical schedules', () => {
    const config = {
      packetCount: 50,
      baseDelayMs: 20,
      randomJitterMs: 30,
      packetLossPercent: 10,
      seed: 42,
    };

    const exp1 = em.createExperiment(config);
    const exp2 = em.createExperiment(config);

    // Schedules must be identical
    for (let i = 0; i < 50; i++) {
      expect(exp1.schedule[i].delayMs).toBe(exp2.schedule[i].delayMs);
      expect(exp1.schedule[i].drop).toBe(exp2.schedule[i].drop);
      expect(exp1.schedule[i].reorder).toBe(exp2.schedule[i].reorder);
    }
  });

  test('different seeds produce different schedules', () => {
    const config = { packetCount: 50, baseDelayMs: 20, randomJitterMs: 30, packetLossPercent: 10 };

    const exp1 = em.createExperiment({ ...config, seed: 111 });
    const exp2 = em.createExperiment({ ...config, seed: 222 });

    // At least some events should differ
    let differences = 0;
    for (let i = 0; i < 50; i++) {
      if (exp1.schedule[i].delayMs !== exp2.schedule[i].delayMs) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  test('schedule contains valid events', () => {
    const exp = em.createExperiment({
      packetCount: 200,
      baseDelayMs: 30,
      randomJitterMs: 40,
      packetLossPercent: 5,
      seed: 99,
    });

    for (const event of exp.schedule) {
      expect(event.seq).toBeGreaterThanOrEqual(1);
      expect(event.seq).toBeLessThanOrEqual(200);
      expect(typeof event.drop).toBe('boolean');
      if (!event.drop) {
        expect(event.delayMs).toBeGreaterThanOrEqual(0);
      }
    }

    // Should have some drops (statistical, but with 200 packets and 5% loss, very likely)
    const drops = exp.schedule.filter(e => e.drop).length;
    expect(drops).toBeGreaterThan(0);
    expect(drops).toBeLessThan(50); // sanity: not more than 25%
  });

  test('experiment state management', () => {
    const exp = em.createExperiment({ packetCount: 10, seed: 1 });
    const stored = em.getExperiment(exp.experimentId);
    expect(stored.state).toBe('created');

    em.updateState(exp.experimentId, 'test_a_running');
    expect(em.getExperiment(exp.experimentId).state).toBe('test_a_running');

    em.storeTestAResults(exp.experimentId, { avgRtt: 50 });
    expect(em.getExperiment(exp.experimentId).state).toBe('test_a_done');
    expect(em.getExperiment(exp.experimentId).testAResults).toEqual({ avgRtt: 50 });

    em.storeTestBResults(exp.experimentId, { avgRtt: 55, effectiveVar: 10 });
    expect(em.getExperiment(exp.experimentId).state).toBe('complete');
  });
});

// ----------------------------------------------------------
// Helper: Mock WebSocket
// ----------------------------------------------------------
function createMockWs() {
  const ws = {
    readyState: 1, // OPEN
    sentMessages: [],
    send(data) {
      this.sentMessages.push(data);
    },
    close(code, reason) {
      this.readyState = 3; // CLOSED
      this.closeCode = code;
      this.closeReason = reason;
    },
  };
  return ws;
}
