// ============================================================
// Main Server — HTTP REST + WebSocket Gateway + UDP Test Server
// ============================================================
// Central relay for dashboard ↔ agent communication.
// Manages sessions, pairing, experiments, and impairment.
// ============================================================

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const url = require('url');

const SessionManager = require('./sessionManager');
const ExperimentManager = require('./experimentManager');
const UDPTestServer = require('./udpTestServer');

// ----------------------------------------------------------
// Configuration
// ----------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 4000;
const UDP_PORT = parseInt(process.env.UDP_PORT, 10) || 5005;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const PAIRING_CODE_EXPIRY = parseInt(process.env.PAIRING_CODE_EXPIRY_MS, 10) || 300000;

// ----------------------------------------------------------
// Initialize
// ----------------------------------------------------------
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const sessionManager = new SessionManager({ codeExpiry: PAIRING_CODE_EXPIRY });
const experimentManager = new ExperimentManager();
const udpServer = new UDPTestServer({ port: UDP_PORT });

const server = http.createServer(app);

// ----------------------------------------------------------
// REST API
// ----------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Create a new session (dashboard calls this)
app.post('/api/session', (req, res) => {
  const session = sessionManager.createSession();
  res.json(session);
});

// Get session status
app.get('/api/session/:sessionId/status', (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Revoke agent credential
app.post('/api/agent/revoke', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const result = sessionManager.revokeAgent(sessionId);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// Create a paired experiment
app.post('/api/experiment', (req, res) => {
  const config = req.body || {};
  const experiment = experimentManager.createExperiment(config);
  res.json(experiment);
});

// Get experiment
app.get('/api/experiment/:experimentId', (req, res) => {
  const exp = experimentManager.getExperiment(req.params.experimentId);
  if (!exp) return res.status(404).json({ error: 'Experiment not found' });
  res.json({
    experimentId: exp.experimentId,
    config: exp.config,
    state: exp.state,
    testAResults: exp.testAResults,
    testBResults: exp.testBResults,
  });
});

// Configure live impairment (ad-hoc)
app.post('/api/impairment', (req, res) => {
  udpServer.setImpairment(req.body);
  res.json({ success: true, impairment: req.body });
});

// ----------------------------------------------------------
// WebSocket Server
// ----------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const parsed = url.parse(request.url, true);
  const pathname = parsed.pathname;

  if (pathname === '/ws/agent' || pathname === '/ws/dashboard') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws._pathname = pathname;
      ws._query = parsed.query;
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, request) => {
  const pathname = ws._pathname;
  const query = ws._query;

  if (pathname === '/ws/agent') {
    handleAgentConnection(ws, query);
  } else if (pathname === '/ws/dashboard') {
    handleDashboardConnection(ws, query);
  }
});

// ----------------------------------------------------------
// Agent WebSocket Handler
// ----------------------------------------------------------
function handleAgentConnection(ws, query) {
  const { code, token } = query;
  let result;

  if (token) {
    // Persistent credential reconnect
    result = sessionManager.authenticateAgent(token, ws);
  } else if (code) {
    // First-time pairing
    result = sessionManager.pairAgent(code, ws);
  } else {
    ws.close(4000, 'Missing code or token parameter');
    return;
  }

  if (!result.success) {
    ws.send(JSON.stringify({ type: 'auth_error', error: result.error }));
    ws.close(4001, result.error);
    return;
  }

  // Send auth success with agent token (for first-time pairing)
  ws.send(JSON.stringify({
    type: 'auth_success',
    agentId: result.agentId,
    agentToken: result.agentToken || undefined, // only sent on first pairing
    sessionId: result.sessionId,
  }));

  console.log(`[WS] Agent ${result.agentId} connected (session: ${result.sessionId})`);

  // Handle messages from agent
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleAgentMessage(ws, message);
    } catch (err) {
      console.error('[WS] Bad agent message:', err.message);
    }
  });

  ws.on('close', () => {
    const sessionId = sessionManager.handleAgentDisconnect(ws);
    if (sessionId) {
      console.log(`[WS] Agent disconnected from session ${sessionId}`);
    }
  });

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
}

// ----------------------------------------------------------
// Dashboard WebSocket Handler
// ----------------------------------------------------------
function handleDashboardConnection(ws, query) {
  const { session: sessionId } = query;

  if (!sessionId) {
    ws.close(4000, 'Missing session parameter');
    return;
  }

  const result = sessionManager.connectDashboard(sessionId, ws);
  if (!result.success) {
    ws.send(JSON.stringify({ type: 'error', error: result.error }));
    ws.close(4001, result.error);
    return;
  }

  console.log(`[WS] Dashboard connected to session ${sessionId}`);

  // Handle messages from dashboard
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleDashboardMessage(ws, sessionId, message);
    } catch (err) {
      console.error('[WS] Bad dashboard message:', err.message);
    }
  });

  ws.on('close', () => {
    sessionManager.handleDashboardDisconnect(ws);
    console.log(`[WS] Dashboard disconnected from session ${sessionId}`);
  });
}

// ----------------------------------------------------------
// Message Handlers
// ----------------------------------------------------------

function handleAgentMessage(agentWs, message) {
  console.log(`[WS-AGENT] Received from agent: ${message.type}`);
  // Agent → Dashboard: relay measurement data, status updates
  switch (message.type) {
    case 'idle_ping':
    case 'measurement':
    case 'test_complete':
    case 'test_a_results':
    case 'test_b_results':
    case 'mitigation_status':
    case 'agent_info':
    case 'buffer_stats':
      sessionManager.routeToDashboard(agentWs, message);
      break;

    case 'experiment_results': {
      const routeResult = sessionManager.routeToDashboard(agentWs, message);
      if (routeResult.success && message.experimentId) {
        if (message.testPhase === 'A') {
          experimentManager.storeTestAResults(message.experimentId, message.results);
        } else if (message.testPhase === 'B') {
          experimentManager.storeTestBResults(message.experimentId, message.results);
        }
      }
      break;
    }

    case 'reload_schedule_request': {
      if (message.experimentId) {
        const exp = experimentManager.getExperiment(message.experimentId);
        if (exp) {
          udpServer.loadSchedule(exp.schedule);
          console.log(`[UDP] Reloaded impairment schedule for experiment ${message.experimentId}`);
        }
      }
      break;
    }

    default:
      // Forward unknown types to dashboard
      sessionManager.routeToDashboard(agentWs, message);
  }
}

function handleDashboardMessage(dashboardWs, sessionId, message) {
  console.log(`[WS-DASHBOARD] Received from session ${sessionId}: ${message.type}`);
  // Dashboard → Agent: relay commands
  switch (message.type) {
    case 'start_test':
    case 'stop_test':
    case 'enable_mitigation':
    case 'disable_mitigation':
      const res = sessionManager.routeToAgent(sessionId, message);
      console.log(`[WS-DASHBOARD] Routed ${message.type} to agent -> result:`, res);
      break;

    case 'configure_impairment':
      // Update UDP test server impairment (live mode)
      udpServer.setImpairment(message.config);
      dashboardWs.send(JSON.stringify({
        type: 'impairment_configured',
        config: message.config,
      }));
      break;

    case 'start_experiment': {
      // Create experiment and load schedule
      const exp = experimentManager.createExperiment(message.config || {});
      udpServer.loadSchedule(exp.schedule);

      // Update session experiment reference
      const session = sessionManager.getSession(sessionId);
      if (session) {
        const fullSession = sessionManager.sessions.get(sessionId);
        if (fullSession) fullSession.experimentId = exp.experimentId;
      }

      // Notify dashboard
      dashboardWs.send(JSON.stringify({
        type: 'experiment_created',
        experimentId: exp.experimentId,
        config: exp.config,
        scheduleLength: exp.schedule.length,
      }));

      // Send experiment info to agent
      sessionManager.routeToAgent(sessionId, {
        type: 'start_experiment',
        experimentId: exp.experimentId,
        config: exp.config,
        schedule: exp.schedule,
      });
      break;
    }

    case 'load_schedule': {
      // Reload schedule for Test B (same experiment)
      const exp = experimentManager.getExperiment(message.experimentId);
      if (exp) {
        udpServer.loadSchedule(exp.schedule);
        sessionManager.routeToAgent(sessionId, {
          type: 'reload_schedule',
          experimentId: exp.experimentId,
          schedule: exp.schedule,
        });
      }
      break;
    }

    default:
      // Forward unknown types to agent
      sessionManager.routeToAgent(sessionId, message);
  }
}

// ----------------------------------------------------------
// Heartbeat Interval
// ----------------------------------------------------------
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// ----------------------------------------------------------
// Start
// ----------------------------------------------------------
async function start() {
  try {
    await udpServer.start();
    server.listen(PORT, () => {
      console.log(`[HTTP] Server listening on port ${PORT}`);
      console.log(`[WS]   Agent endpoint:     ws://localhost:${PORT}/ws/agent`);
      console.log(`[WS]   Dashboard endpoint:  ws://localhost:${PORT}/ws/dashboard`);
      console.log(`[UDP]  Test server on port ${UDP_PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  clearInterval(heartbeatInterval);
  wss.close();
  await udpServer.stop();
  server.close();
  sessionManager.destroy();
  process.exit(0);
});

// Only start if run directly (not required as module for tests)
if (require.main === module) {
  start();
}

module.exports = { app, server, wss, sessionManager, experimentManager, udpServer, start };
