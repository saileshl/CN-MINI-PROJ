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
    this.revokedTokens = new Set();     // Set of revoked token strings
    this.codeExpiry = options.codeExpiry || 5 * 60 * 1000; // 5 min default

    this.activeAgentWs = null;
    this.activeAgentId = null;
    this.activeAgentToken = null;

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
      dashboardSockets: new Set(),
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
    const normalizedCode = (pairingCode || '').trim().toUpperCase();
    const sessionId = this.pairingCodes.get(normalizedCode);
    if (!sessionId) {
      return { success: false, error: 'Invalid or expired pairing code' };
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (Date.now() > session.pairingExpiry) {
      this.pairingCodes.delete(normalizedCode);
      return { success: false, error: 'Pairing code has expired' };
    }

    // Generate persistent agent identity
    const agentId = uuidv4();
    const agentToken = crypto.randomBytes(32).toString('hex');

    // Store active agent
    this.activeAgentWs = agentWs;
    this.activeAgentId = agentId;
    this.activeAgentToken = agentToken;

    // Store mappings
    session.agentId = agentId;
    session.agentToken = agentToken;
    session.agentWs = agentWs;
    session.paired = true;

    this.agentTokens.set(agentToken, { agentId, sessionId });
    this.agentSessions.set(agentId, sessionId);

    // Clean up used pairing code
    this.pairingCodes.delete(normalizedCode);

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
    if (this.revokedTokens.has(agentToken)) {
      return { success: false, error: 'Invalid or revoked agent token' };
    }

    const tokenData = this.agentTokens.get(agentToken);
    if (!tokenData) {
      return { success: false, error: 'Invalid or revoked agent token' };
    }

    const { agentId, sessionId } = tokenData;
    let session = this.sessions.get(sessionId);

    this.activeAgentWs = agentWs;
    this.activeAgentId = agentId;
    this.activeAgentToken = agentToken;

    if (!session) {
      const newSessionId = uuidv4();
      session = {
        sessionId: newSessionId,
        pairingCode: null,
        createdAt: Date.now(),
        pairingExpiry: 0,
        agentId,
        agentToken,
        dashboardWs: null,
        dashboardSockets: new Set(),
        agentWs: agentWs,
        paired: true,
        testState: 'idle',
        experimentId: null,
      };
      this.sessions.set(newSessionId, session);
      this.agentTokens.set(agentToken, { agentId, sessionId: newSessionId });
      this.agentSessions.set(agentId, newSessionId);

      return { success: true, agentId, agentToken, sessionId: newSessionId, newSession: true };
    }

    // Re-associate agent with existing session
    session.agentWs = agentWs;
    session.agentId = agentId;
    session.agentToken = agentToken;
    session.paired = true;

    this._notifyDashboard(session.sessionId, {
      type: 'agent_status',
      status: 'connected',
      agentId,
    });

    return { success: true, agentId, agentToken, sessionId: session.sessionId, newSession: false };
  }

  // ----------------------------------------------------------
  // Agent Token Revocation
  // ----------------------------------------------------------
  revokeAgent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session not found' };
    if (!session.agentToken && !this.activeAgentToken) return { success: false, error: 'No agent paired' };

    const token = session.agentToken || this.activeAgentToken;
    this.revokedTokens.add(token);
    this.agentTokens.delete(token);
    if (session.agentId) this.agentSessions.delete(session.agentId);
    if (this.activeAgentId) this.agentSessions.delete(this.activeAgentId);

    // Close agent WS if connected
    if (session.agentWs && session.agentWs.readyState === 1) {
      try {
        session.agentWs.send(JSON.stringify({ type: 'revoked', message: 'Agent credential has been revoked' }));
        session.agentWs.close(4001, 'Token revoked');
      } catch {}
    }

    this.activeAgentWs = null;
    this.activeAgentId = null;
    this.activeAgentToken = null;

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
    let session = this.sessions.get(sessionId);
    if (!session) {
      const pairingCode = this._generatePairingCode();
      session = {
        sessionId,
        pairingCode,
        createdAt: Date.now(),
        pairingExpiry: Date.now() + this.codeExpiry,
        agentId: this.activeAgentId || null,
        agentToken: this.activeAgentToken || null,
        dashboardWs,
        dashboardSockets: new Set([dashboardWs]),
        agentWs: this.activeAgentWs || null,
        paired: !!(this.activeAgentWs && this.activeAgentWs.readyState === 1),
        testState: 'idle',
        experimentId: null,
      };
      this.sessions.set(sessionId, session);
      this.pairingCodes.set(pairingCode, sessionId);
    } else {
      if (!session.dashboardSockets) session.dashboardSockets = new Set();
      session.dashboardSockets.add(dashboardWs);
      session.dashboardWs = dashboardWs;
      if (this.activeAgentWs && this.activeAgentWs.readyState === 1 && !session.agentWs) {
        session.agentWs = this.activeAgentWs;
        session.agentId = this.activeAgentId;
        session.agentToken = this.activeAgentToken;
        session.paired = true;
      }
    }

    const isConnected = !!(session.paired && session.agentWs && session.agentWs.readyState === 1) ||
                        !!(this.activeAgentWs && this.activeAgentWs.readyState === 1);
    const status = isConnected ? 'connected' : 'disconnected';

    dashboardWs.send(JSON.stringify({
      type: 'agent_status',
      status,
      agentId: session.agentId || this.activeAgentId,
      pairingCode: session.pairingCode,
    }));

    return { success: true, sessionId };
  }

  // ----------------------------------------------------------
  // Agent Disconnect Detection
  // ----------------------------------------------------------
  handleAgentDisconnect(agentWs) {
    if (this.activeAgentWs === agentWs) {
      this.activeAgentWs = null;
    }
    for (const [sessionId, session] of this.sessions) {
      if (session.agentWs === agentWs) {
        session.agentWs = null;
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
      if (session.dashboardSockets) {
        session.dashboardSockets.delete(dashboardWs);
      }
      if (session.dashboardWs === dashboardWs) {
        session.dashboardWs = session.dashboardSockets ? session.dashboardSockets.values().next().value || null : null;
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
    if (session && session.agentWs && session.agentWs.readyState === 1) {
      try {
        session.agentWs.send(JSON.stringify(message));
        return { success: true };
      } catch (err) {
        console.error('[WS] Failed to send to agent:', err.message);
      }
    }

    // Fallback if session has no direct agentWs but an active agent is connected
    if (this.activeAgentWs && this.activeAgentWs.readyState === 1) {
      try {
        this.activeAgentWs.send(JSON.stringify(message));
        return { success: true };
      } catch (err) {
        console.error('[WS] Fallback send to active agent failed:', err.message);
      }
    }

    return { success: false, error: 'Agent not connected' };
  }

  routeToDashboard(agentWs, message) {
    let delivered = false;
    for (const [sessionId, session] of this.sessions) {
      if (session.agentWs === agentWs) {
        this._notifyDashboard(sessionId, message);
        delivered = true;
      }
    }

    if (!delivered) {
      this._broadcastToAllDashboards(message);
    }

    return { success: true };
  }

  // ----------------------------------------------------------
  // Session Lookup
  // ----------------------------------------------------------
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const isConnected = !!(session.paired && session.agentWs && session.agentWs.readyState === 1) ||
                        !!(this.activeAgentWs && this.activeAgentWs.readyState === 1);
    return {
      sessionId: session.sessionId,
      pairingCode: session.pairingCode,
      expiresAt: session.pairingExpiry,
      paired: isConnected || session.paired,
      agentConnected: isConnected,
      agentId: session.agentId || this.activeAgentId,
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
    this.activeAgentWs = null;
  }

  // ----------------------------------------------------------
  // Internal Helpers
  // ----------------------------------------------------------
  _generatePairingCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars[bytes[i] % chars.length];
    }
    if (this.pairingCodes.has(code)) return this._generatePairingCode();
    return code;
  }

  _broadcastToAllDashboards(message) {
    const payload = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      if (session.dashboardSockets && session.dashboardSockets.size > 0) {
        for (const ws of session.dashboardSockets) {
          if (ws && ws.readyState === 1) {
            try { ws.send(payload); } catch {}
          }
        }
      } else if (session.dashboardWs && session.dashboardWs.readyState === 1) {
        try { session.dashboardWs.send(payload); } catch {}
      }
    }
  }

  _notifyDashboard(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const payload = JSON.stringify(message);
      if (session.dashboardSockets && session.dashboardSockets.size > 0) {
        for (const ws of session.dashboardSockets) {
          if (ws && ws.readyState === 1) {
            try { ws.send(payload); } catch {}
          }
        }
      } else if (session.dashboardWs && session.dashboardWs.readyState === 1) {
        try { session.dashboardWs.send(payload); } catch {}
      }
    }
  }
}

module.exports = SessionManager;
