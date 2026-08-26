// ============================================================
// UDP Test Server Tests — Echo, Impairment, Schedule Replay
// ============================================================

const dgram = require('dgram');
const UDPTestServer = require('../src/udpTestServer');

// Helper: send UDP packet and wait for response
function sendAndReceive(port, packet, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const timer = setTimeout(() => {
      client.close();
      resolve(null); // timeout = no response (dropped)
    }, timeoutMs);

    client.on('message', (msg) => {
      clearTimeout(timer);
      client.close();
      try {
        resolve(JSON.parse(msg.toString()));
      } catch {
        resolve(null);
      }
    });

    const data = Buffer.from(JSON.stringify(packet));
    client.send(data, port, '127.0.0.1');
  });
}

describe('UDPTestServer', () => {
  let server;
  const TEST_PORT = 15005; // avoid conflict with production

  beforeEach(async () => {
    server = new UDPTestServer({ port: TEST_PORT });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  // -- Basic Echo --
  test('echoes packet with no impairment', async () => {
    const packet = { seq: 1, sendTimestamp: Date.now() };
    const response = await sendAndReceive(TEST_PORT, packet);

    expect(response).not.toBeNull();
    expect(response.seq).toBe(1);
    expect(response.sendTimestamp).toBe(packet.sendTimestamp);
    expect(response.serverTimestamp).toBeDefined();
    expect(response.appliedDelayMs).toBe(0);
  });

  // -- Live Mode: Base Delay --
  test('applies base delay in live mode', async () => {
    server.setImpairment({ baseDelayMs: 50, randomJitterMs: 0 });

    const startTime = Date.now();
    const response = await sendAndReceive(TEST_PORT, { seq: 1, sendTimestamp: Date.now() });
    const elapsed = Date.now() - startTime;

    expect(response).not.toBeNull();
    // Allow some tolerance for system overhead
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  // -- Schedule Replay: Deterministic --
  test('replays schedule deterministically', async () => {
    const schedule = [
      { seq: 1, delayMs: 0, drop: false, reorder: false },
      { seq: 2, delayMs: 50, drop: false, reorder: false },
      { seq: 3, delayMs: 0, drop: true, reorder: false },
    ];
    server.loadSchedule(schedule);

    // Packet 1: no delay
    const r1 = await sendAndReceive(TEST_PORT, { seq: 1, sendTimestamp: Date.now() });
    expect(r1).not.toBeNull();
    expect(r1.seq).toBe(1);

    // Packet 2: 50ms delay
    const start2 = Date.now();
    const r2 = await sendAndReceive(TEST_PORT, { seq: 2, sendTimestamp: Date.now() });
    const elapsed2 = Date.now() - start2;
    expect(r2).not.toBeNull();
    expect(r2.seq).toBe(2);
    expect(elapsed2).toBeGreaterThanOrEqual(40);

    // Packet 3: dropped
    const r3 = await sendAndReceive(TEST_PORT, { seq: 3, sendTimestamp: Date.now() }, 500);
    expect(r3).toBeNull(); // no response expected
  });

  // -- Schedule Clear --
  test('clears schedule and returns to live mode', async () => {
    server.loadSchedule([{ seq: 1, delayMs: 0, drop: true, reorder: false }]);

    // Should drop in replay mode
    const r1 = await sendAndReceive(TEST_PORT, { seq: 1, sendTimestamp: Date.now() }, 500);
    expect(r1).toBeNull();

    // Clear schedule
    server.clearSchedule();

    // Should echo in live mode
    const r2 = await sendAndReceive(TEST_PORT, { seq: 1, sendTimestamp: Date.now() });
    expect(r2).not.toBeNull();
    expect(r2.seq).toBe(1);
  });
});
