// ============================================================
// UDP Test Server — Echo + Deterministic Impairment
// ============================================================
// Two modes:
//   1. Live mode: applies impairment using live RNG
//   2. Schedule replay mode: replays a pre-generated schedule
// ============================================================

const dgram = require('dgram');

class UDPTestServer {
  constructor(options = {}) {
    this.port = options.port || 5005;
    this.host = options.host || '0.0.0.0';
    this.server = null;

    // Live mode impairment config
    this.impairment = {
      baseDelayMs: 0,
      randomJitterMs: 0,
      packetLossPercent: 0,
      reorderPercent: 0,
      burstDelayMs: 0,
      burstProbability: 0,
    };

    // Schedule replay mode
    this.schedule = null;          // array of { seq, delayMs, drop, reorder }
    this.scheduleMap = null;       // Map<seq, event> for O(1) lookup
    this.replayMode = false;
  }

  // ----------------------------------------------------------
  // Start the UDP server
  // ----------------------------------------------------------
  start() {
    return new Promise((resolve, reject) => {
      this.server = dgram.createSocket('udp4');

      this.server.on('error', (err) => {
        console.error(`[UDP] Server error: ${err.message}`);
        reject(err);
      });

      this.server.on('message', (msg, rinfo) => {
        this._handlePacket(msg, rinfo);
      });

      this.server.bind(this.port, this.host, () => {
        console.log(`[UDP] Test server listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  // ----------------------------------------------------------
  // Stop the server
  // ----------------------------------------------------------
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // ----------------------------------------------------------
  // Configure live impairment
  // ----------------------------------------------------------
  setImpairment(config) {
    Object.assign(this.impairment, config);
    this.replayMode = false;
    this.schedule = null;
    this.scheduleMap = null;
  }

  // ----------------------------------------------------------
  // Load a schedule for replay mode
  // ----------------------------------------------------------
  loadSchedule(schedule) {
    this.schedule = schedule;
    this.scheduleMap = new Map();
    for (const event of schedule) {
      this.scheduleMap.set(event.seq, event);
    }
    this.replayMode = true;
  }

  // ----------------------------------------------------------
  // Clear schedule, return to live mode
  // ----------------------------------------------------------
  clearSchedule() {
    this.schedule = null;
    this.scheduleMap = null;
    this.replayMode = false;
  }

  // ----------------------------------------------------------
  // Handle incoming packet
  // ----------------------------------------------------------
  _handlePacket(msg, rinfo) {
    let packet;
    try {
      packet = JSON.parse(msg.toString());
    } catch {
      return; // malformed packet, ignore
    }

    const seq = packet.seq;
    const serverTimestamp = Date.now();

    if (this.replayMode && this.scheduleMap) {
      this._handleReplayMode(packet, seq, serverTimestamp, rinfo);
    } else {
      this._handleLiveMode(packet, seq, serverTimestamp, rinfo);
    }
  }

  // ----------------------------------------------------------
  // Schedule replay mode: exact per-packet behavior
  // ----------------------------------------------------------
  _handleReplayMode(packet, seq, serverTimestamp, rinfo) {
    const event = this.scheduleMap.get(seq);
    if (!event) {
      // No schedule entry for this seq — echo immediately
      this._sendResponse(packet, serverTimestamp, 0, rinfo);
      return;
    }

    if (event.drop) {
      // Packet dropped — no response
      return;
    }

    const delayMs = event.delayMs || 0;
    if (delayMs > 0) {
      setTimeout(() => {
        this._sendResponse(packet, serverTimestamp, delayMs, rinfo);
      }, delayMs);
    } else {
      this._sendResponse(packet, serverTimestamp, 0, rinfo);
    }
  }

  // ----------------------------------------------------------
  // Live mode: real-time RNG impairment
  // ----------------------------------------------------------
  _handleLiveMode(packet, seq, serverTimestamp, rinfo) {
    const { baseDelayMs, randomJitterMs, packetLossPercent, reorderPercent, burstDelayMs, burstProbability } = this.impairment;

    // Packet loss
    if (Math.random() * 100 < packetLossPercent) {
      return; // dropped
    }

    // Calculate delay
    let delayMs = baseDelayMs;
    if (randomJitterMs > 0) {
      delayMs += (Math.random() * 2 - 1) * randomJitterMs;
    }

    // Burst delay
    if (burstDelayMs > 0 && Math.random() * 100 < burstProbability) {
      delayMs += burstDelayMs;
    }

    // Reordering (extra delay)
    if (Math.random() * 100 < reorderPercent) {
      delayMs += Math.random() * randomJitterMs * 2;
    }

    delayMs = Math.max(0, Math.round(delayMs));

    if (delayMs > 0) {
      setTimeout(() => {
        this._sendResponse(packet, serverTimestamp, delayMs, rinfo);
      }, delayMs);
    } else {
      this._sendResponse(packet, serverTimestamp, 0, rinfo);
    }
  }

  // ----------------------------------------------------------
  // Send echo response
  // ----------------------------------------------------------
  _sendResponse(packet, serverTimestamp, appliedDelayMs, rinfo) {
    const response = JSON.stringify({
      seq: packet.seq,
      sendTimestamp: packet.sendTimestamp,
      serverTimestamp,
      appliedDelayMs,
    });

    if (this.server) {
      this.server.send(response, rinfo.port, rinfo.address);
    }
  }
}

module.exports = UDPTestServer;
