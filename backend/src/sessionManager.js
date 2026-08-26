// ============================================================
// Session Manager — Pairing, Agent Identity, Session Isolation
// ============================================================
// Handles: session creation, pairing codes, persistent agent
// tokens, session-agent mapping, and multi-user isolation.
// ============================================================

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class SessionManager {
  constructor(options = {}) {
    this.sessions = new Map();          // sessionId -> SessionState
    this.pairingCodes = new Map();      // code -> sessionId
    this.agentTokens = new Map();       // token -> { agentId, sessionId }
    this.agentSessions = new Map();     // agentId -> sessionId
    this.codeExpiry = options.codeExpiry || 5 * 60 * 1000; // 5 min default

    // Periodic cleanup of expired pairing codes (not agent tokens)
    this._cleanupInterval = setInterval(() => this.cleanExpiredPairingCodes(), 60_000);
  }

  // ----------------------------------------------------------
  // Session Creation
  // ----------------------------------------------------------
  createSession() {
    const sessionId = uuidv4();
    const pairingCode = this._generatePairingCode();
    const now = Date.now();

    const session = {
      sessionId,
      pairingCode,
      createdAt: now,
      pairingExpiry: now + this.codeExpiry,
      agentId: null,
      agentToken: null,
      dashboardWs: null,
      agentWs: null,
      paired: false,
      testState: 'idle',     // idle | running | stopped
      experimentId: null,
    };

    this.sessions.set(sessionId, session);
    this.pairingCodes.set(pairingCode, sessionId);

    return { sessionId, pairingCode, expiresAt: session.pairingExpiry };
  }

  // ----------------------------------------------------------
  // First-Time Agent Pairing (code-based)
  // ----------------------------------------------------------
  pairAgent(pairingCode, agentWs) {
    const sessionId = this.pairingCodes.get(pairingCode);
    if (!sessionId) {
      return { success: false, error: 'Invalid or expired pairing code' };
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (Date.now() > session.pairingExpiry) {
      this.pairingCodes.delete(pairingCode);
      return { success: false, error: 'Pairing code has expired' };
    }

    // Generate persistent agent identity
    const agentId = uuidv4();
    const agentToken = crypto.randomBytes(32).toString('hex');

    // Store mappings
    session.agentId = agentId;
    session.agentToken = agentToken;
    session.agentWs = agentWs;
    session.paired = true;

    this.agentTokens.set(agentToken, { agentId, sessionId });
    this.agentSessions.set(agentId, sessionId);

    // Clean up used pairing code
    this.pairingCodes.delete(pairingCode);

    // Notify dashboard
    this._notifyDashboard(sessionId, {
      type: 'agent_status',
      status: 'connected',
      agentId,
    });

    return { success: true, agentId, agentToken, sessionId };
  }

  // ----------------------------------------------------------
  // Persistent Agent Authentication (token-based reconnect)
  // ----------------------------------------------------------
  authenticateAgent(agentToken, agentWs) {
    const tokenData = this.agentTokens.get(agentToken);
    if (!tokenData) {
      return { success: false, error: 'Invalid or revoked agent token' };
    }

    const { agentId, sessionId } = tokenData;
    const session = this.sessions.get(sessionId);

    if (!session) {
      // Session may have been cleaned up; create a fresh session for this agent
      const newSessionId = uuidv4();
      const newSession = {
        sessionId: newSessionId,
        pairingCode: null,
        createdAt: Date.now(),
        pairingExpiry: 0,
        agentId,
        agentToken,
        dashboardWs: null,
        agentWs: agentWs,
        paired: true,
        testState: 'idle',
        experimentId: null,
      };
      this.sessions.set(newSessionId, newSession);
      this.agentTokens.set(agentToken, { agentId, sessionId: newSessionId });
      this.agentSessions.set(agentId, newSessionId);

      return { success: true, agentId, sessionId: newSessionId, newSession: true };
    }

    // Re-associate agent with existing session
    session.agentWs = agentWs;
    session.paired = true;

    this._notifyDashboard(sessionId, {
      type: 'agent_status',
      status: 'connected',
      agentId,
    });

    return { success: true, agentId, sessionId, newSession: false };
  }

  // ----------------------------------------------------------
  // Agent Token Revocation
  // ----------------------------------------------------------
  revokeAgent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session not found' };
    if (!session.agentToken) return { success: false, error: 'No agent paired' };

    // Remove token
    this.agentTokens.delete(session.agentToken);
    this.agentSessions.delete(session.agentId);

    // Close agent WS if connected
    if (session.agentWs && session.agentWs.readyState === 1) {
      session.agentWs.send(JSON.stringify({ type: 'revoked', message: 'Agent credential has been revoked' }));
      session.agentWs.close(4001, 'Token revoked');
    }

    session.agentId = null;
    session.agentToken = null;
    session.agentWs = null;
    session.paired = false;

    this._notifyDashboard(sessionId, {
      type: 'agent_status',
      status: 'disconnected',
      reason: 'revoked',
    });

    return { success: true };
  }

  // ----------------------------------------------------------
  // Dashboard Connection
  // ----------------------------------------------------------
  connectDashboard(sessionId, dashboardWs) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    session.dashboardWs = dashboardWs;

    // Send current agent status
    const status = session.paired && session.agentWs && session.agentWs.readyState === 1
      ? 'connected' : 'disconnected';

    dashboardWs.send(JSON.stringify({
      type: 'agent_status',
      status,
      agentId: session.agentId,
    }));

    return { success: true, sessionId };
  }

  // ----------------------------------------------------------
  // Agent Disconnect Detection
  // ----------------------------------------------------------
  handleAgentDisconnect(agentWs) {
    for (const [sessionId, session] of this.sessions) {
      if (session.agentWs === agentWs) {
        session.agentWs = null;
        // Do NOT clear paired/agentId/agentToken — agent can reconnect
        this._notifyDashboard(sessionId, {
          type: 'agent_status',
          status: 'disconnected',
          reason: 'connection_lost',
          agentId: session.agentId,
        });
        return sessionId;
      }
    }
    return null;
  }

  // ----------------------------------------------------------
  // Dashboard Disconnect Detection
  // ----------------------------------------------------------
  handleDashboardDisconnect(dashboardWs) {
    for (const [sessionId, session] of this.sessions) {
      if (session.dashboardWs === dashboardWs) {
        session.dashboardWs = null;
        return sessionId;
      }
    }
    return null;
  }

  // ----------------------------------------------------------
  // Message Routing (with isolation)
  // ----------------------------------------------------------
  routeToAgent(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session not found' };
    if (!session.agentWs || session.agentWs.readyState !== 1) {
      return { success: false, error: 'Agent not connected' };
    }
    session.agentWs.send(JSON.stringify(message));
    return { success: true };
  }

  routeToDashboard(agentWs, message) {
    for (const [sessionId, session] of this.sessions) {
      if (session.agentWs === agentWs) {
        this._notifyDashboard(sessionId, message);
        return { success: true, sessionId };
      }
    }
    return { success: false, error: 'No session found for this agent' };
  }

  // ----------------------------------------------------------
  // Session Lookup
  // ----------------------------------------------------------
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      sessionId: session.sessionId,
      paired: session.paired,
      agentConnected: !!(session.agentWs && session.agentWs.readyState === 1),
      agentId: session.agentId,
      testState: session.testState,
      experimentId: session.experimentId,
    };
  }

  getSessionByAgentToken(token) {
    const tokenData = this.agentTokens.get(token);
    if (!tokenData) return null;
    return this.getSession(tokenData.sessionId);
  }

  // ----------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------
  cleanExpiredPairingCodes() {
    const now = Date.now();
    for (const [code, sessionId] of this.pairingCodes) {
      const session = this.sessions.get(sessionId);
      if (!session || now > session.pairingExpiry) {
        this.pairingCodes.delete(code);
      }
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this.sessions.clear();
    this.pairingCodes.clear();
    this.agentTokens.clear();
    this.agentSessions.clear();
  }

  // ----------------------------------------------------------
  // Internal Helpers
  // ----------------------------------------------------------
  _generatePairingCode() {
    // 6-char alphanumeric, uppercase
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars[bytes[i] % chars.length];
    }
    // Ensure uniqueness
    if (this.pairingCodes.has(code)) return this._generatePairingCode();
    return code;
  }

  _notifyDashboard(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session && session.dashboardWs && session.dashboardWs.readyState === 1) {
      session.dashboardWs.send(JSON.stringify(message));
    }
  }
}

module.exports = SessionManager;
