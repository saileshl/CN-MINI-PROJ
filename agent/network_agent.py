"""
Network Jitter Agent — UDP Measurement + WebSocket Streaming
=============================================================
Connects to the backend via WebSocket (first-time pairing code or
persistent stored credential), performs UDP echo tests against the
test server, calculates RTT-based jitter metrics, and streams
results to the dashboard in real-time.

Credentials:
  - First-time: user enters pairing code → backend issues agent_token
  - Stored at: ~/.networkjitter/credentials.json
  - Subsequent startups: auto-connect using stored token
  - Reset: --reset flag deletes stored credentials
"""

import os
import sys
import json
import time
import socket
import signal
import asyncio
import argparse
import math
import statistics
from pathlib import Path

# Force UTF-8 on Windows stdout/stderr to prevent charmap UnicodeEncodeError
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import websockets
except ImportError:
    print("ERROR: 'websockets' package not found.")
    print("Install it with: pip install websockets")
    sys.exit(1)

from jitter_buffer import JitterBuffer

# ----------------------------------------------------------
# Configuration
# ----------------------------------------------------------
DEFAULT_CONFIG = {
    "backend_url": "ws://localhost:4000/ws/agent",
    "udp_target_host": "127.0.0.1",
    "udp_target_port": 5005,
    "packet_count": 200,
    "packet_interval_ms": 50,
    "jitter_buffer_min_ms": 20,
    "jitter_buffer_max_ms": 200,
}

CREDENTIALS_DIR = Path.home() / ".networkjitter"
CREDENTIALS_FILE = CREDENTIALS_DIR / "credentials.json"
VERSION = "1.0.0"


# ----------------------------------------------------------
# Credential Management
# ----------------------------------------------------------
def load_credentials():
    """Load stored agent credentials."""
    if CREDENTIALS_FILE.exists():
        try:
            with open(CREDENTIALS_FILE, 'r') as f:
                creds = json.load(f)
                if creds.get('agent_token') and creds.get('agent_id'):
                    return creds
        except (json.JSONDecodeError, IOError):
            pass
    return None


def save_credentials(agent_id, agent_token, backend_url):
    """Store agent credentials securely."""
    CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
    creds = {
        "agent_id": agent_id,
        "agent_token": agent_token,
        "backend_url": backend_url,
    }
    with open(CREDENTIALS_FILE, 'w') as f:
        json.dump(creds, f, indent=2)

    # Set file permissions (user-only on Unix)
    try:
        os.chmod(CREDENTIALS_FILE, 0o600)
    except (OSError, AttributeError):
        pass  # Windows doesn't support Unix permissions


def delete_credentials():
    """Delete stored credentials for re-pairing."""
    if CREDENTIALS_FILE.exists():
        CREDENTIALS_FILE.unlink()
        print("[*] Credentials deleted. You will need to pair again.")


# ----------------------------------------------------------
# Load Configuration
# ----------------------------------------------------------
def load_config():
    """Load configuration from config.json or defaults."""
    config = DEFAULT_CONFIG.copy()
    config_path = Path(__file__).parent / "config.json"
    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                user_config = json.load(f)
                config.update(user_config)
        except (json.JSONDecodeError, IOError):
            pass
    return config


# ----------------------------------------------------------
# RTT Jitter Calculations
# ----------------------------------------------------------
def calculate_metrics(rtt_values):
    """
    Calculate RTT-based jitter metrics.

    Primary jitter metric: RTT Variation
        variation_i = abs(RTT_i - RTT_{i-1})
        Average RTT Variation = mean(variation_i)

    This is NOT RFC 3550 RTP interarrival jitter.
    """
    if not rtt_values:
        return {}

    # RTT statistics
    avg_rtt = statistics.mean(rtt_values)
    min_rtt = min(rtt_values)
    max_rtt = max(rtt_values)
    stdev_rtt = statistics.stdev(rtt_values) if len(rtt_values) >= 2 else 0.0

    # Percentiles
    sorted_rtt = sorted(rtt_values)
    p50 = _percentile(sorted_rtt, 50)
    p95 = _percentile(sorted_rtt, 95)
    p99 = _percentile(sorted_rtt, 99)

    # RTT Variation (our jitter metric)
    variations = []
    for i in range(1, len(rtt_values)):
        variations.append(abs(rtt_values[i] - rtt_values[i - 1]))

    avg_variation = statistics.mean(variations) if variations else 0.0

    return {
        "avg_rtt": round(avg_rtt, 4),
        "min_rtt": round(min_rtt, 4),
        "max_rtt": round(max_rtt, 4),
        "stdev_rtt": round(stdev_rtt, 4),
        "p50_rtt": round(p50, 4),
        "p95_rtt": round(p95, 4),
        "p99_rtt": round(p99, 4),
        "avg_rtt_variation": round(avg_variation, 4),
        "sample_count": len(rtt_values),
    }


def _percentile(sorted_data, pct):
    """Calculate percentile from sorted list."""
    if not sorted_data:
        return 0
    k = (len(sorted_data) - 1) * pct / 100
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_data[int(k)]
    return sorted_data[int(f)] * (c - k) + sorted_data[int(c)] * (k - f)


# ----------------------------------------------------------
# UDP Test Execution
# ----------------------------------------------------------
def run_udp_test(config, jitter_buffer=None):
    """
    Send UDP packets to the test server and measure RTT.

    Returns:
        list of per-packet results, aggregate metrics
    """
    host = config["udp_target_host"]
    port = config["udp_target_port"]
    count = config["packet_count"]
    interval_ms = config["packet_interval_ms"]

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(2.0)  # 2 second timeout per packet

    results = []
    rtt_values = []
    packets_sent = 0
    packets_received = 0

    for seq in range(1, count + 1):
        send_time = time.time() * 1000  # ms

        packet = json.dumps({
            "seq": seq,
            "sendTimestamp": send_time,
        }).encode()

        try:
            sock.sendto(packet, (host, port))
            packets_sent += 1

            try:
                data, _ = sock.recvfrom(4096)
                recv_time = time.time() * 1000
                response = json.loads(data.decode())

                rtt = recv_time - send_time
                rtt_values.append(rtt)
                packets_received += 1

                result = {
                    "seq": seq,
                    "rtt": round(rtt, 4),
                    "send_time": send_time,
                    "recv_time": recv_time,
                    "server_timestamp": response.get("serverTimestamp"),
                    "applied_delay": response.get("appliedDelayMs", 0),
                    "status": "received",
                }

                # Feed into jitter buffer if enabled
                if jitter_buffer is not None:
                    buf_result = jitter_buffer.receive_packet(seq, recv_time, result)
                    result["buffer_status"] = buf_result["status"]

            except socket.timeout:
                result = {
                    "seq": seq,
                    "rtt": None,
                    "send_time": send_time,
                    "recv_time": None,
                    "status": "timeout",
                }

        except Exception as e:
            result = {
                "seq": seq,
                "rtt": None,
                "status": "error",
                "error": str(e),
            }

        results.append(result)

        # Wait for next packet (subtract processing time)
        elapsed = (time.time() * 1000) - send_time
        sleep_ms = max(0, interval_ms - elapsed)
        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000)

    sock.close()

    # Calculate metrics
    packet_loss = ((packets_sent - packets_received) / packets_sent * 100) if packets_sent > 0 else 0
    metrics = calculate_metrics(rtt_values)
    metrics["packets_sent"] = packets_sent
    metrics["packets_received"] = packets_received
    metrics["packet_loss_percent"] = round(packet_loss, 2)

    # Buffer stats if mitigation is enabled
    if jitter_buffer is not None:
        # Run playout for remaining buffered packets
        current_time = time.time() * 1000
        while True:
            playout_result = jitter_buffer.playout(current_time)
            if playout_result is None:
                break
            current_time += jitter_buffer.playout_interval_ms

        metrics["buffer_stats"] = jitter_buffer.get_stats()

    return results, metrics


# ----------------------------------------------------------
# Agent Main Class
# ----------------------------------------------------------
class NetworkAgent:
    def __init__(self, config, pairing_code=None):
        self.config = config
        self.pairing_code = pairing_code.strip().upper() if pairing_code else None
        self.credentials = None
        self.ws = None
        self.running = True
        self.jitter_buffer = None
        self.mitigation_enabled = False
        self.current_experiment = None
        self.test_running = False

    async def connect(self):
        """Connect to backend with stored credential or pairing code."""
        # If user explicitly passed --code, use that
        if self.pairing_code:
            url = f"{self.config['backend_url']}?code={self.pairing_code}"
            print(f"[*] Pairing with code: {self.pairing_code}")
        else:
            # Try stored credentials
            self.credentials = load_credentials()
            if self.credentials:
                url = f"{self.config['backend_url']}?token={self.credentials['agent_token']}"
                print(f"[*] Connecting with stored credential (Agent: {self.credentials['agent_id'][:8]}...)")
            else:
                # Prompt for pairing code interactively
                code = input("[?] Enter pairing code from website: ").strip().upper()
                self.pairing_code = code
                url = f"{self.config['backend_url']}?code={self.pairing_code}"
                print(f"[*] Pairing with code: {self.pairing_code}")

        try:
            self.ws = await websockets.connect(url, ping_interval=30, ping_timeout=30)
            # Wait for auth response
            auth_msg = await asyncio.wait_for(self.ws.recv(), timeout=10)
            auth_data = json.loads(auth_msg)

            if auth_data.get("type") == "auth_error":
                print(f"[!] Authentication failed: {auth_data.get('error')}")
                if self.credentials:
                    # Stale token — auto-clear and retry
                    print("[*] Stored credential is stale/revoked. Clearing it automatically.")
                    delete_credentials()
                    self.credentials = None
                # If code failed or was rejected, clear code so reconnect loop can prompt fresh
                self.pairing_code = None
                return False

            if auth_data.get("type") == "auth_success":
                agent_id = auth_data["agentId"]
                agent_token = auth_data.get("agentToken")

                # Save credentials
                if agent_token:
                    save_credentials(agent_id, agent_token, self.config["backend_url"])
                    print(f"[✓] Paired successfully! Agent ID: {agent_id[:8]}...")
                    print(f"[*] Credentials saved. Future startups will connect automatically.")
                else:
                    print(f"[✓] Reconnected as Agent: {agent_id[:8]}...")

                # Clear pairing_code now that pairing is done
                self.pairing_code = None

                # Send agent info
                await self.ws.send(json.dumps({
                    "type": "agent_info",
                    "version": VERSION,
                    "agentId": agent_id,
                }))

                return True

        except Exception as e:
            print(f"[!] Connection failed: {e}")
            return False

    async def _connect_with_code(self, code):
        """Connect using a pairing code (used as fallback after stale token)."""
        url = f"{self.config['backend_url']}?code={code}"
        try:
            self.ws = await websockets.connect(url, ping_interval=30, ping_timeout=30)
            auth_msg = await asyncio.wait_for(self.ws.recv(), timeout=10)
            auth_data = json.loads(auth_msg)

            if auth_data.get("type") == "auth_error":
                print(f"[!] Pairing failed: {auth_data.get('error')}")
                return False

            if auth_data.get("type") == "auth_success":
                agent_id = auth_data["agentId"]
                agent_token = auth_data.get("agentToken")
                if agent_token:
                    save_credentials(agent_id, agent_token, self.config["backend_url"])
                    print(f"[✓] Re-paired successfully! Agent ID: {agent_id[:8]}...")
                    print(f"[*] Credentials saved. Future startups will connect automatically.")

                await self.ws.send(json.dumps({
                    "type": "agent_info",
                    "version": VERSION,
                    "agentId": agent_id,
                }))
                return True

        except Exception as e:
            print(f"[!] Pairing connection failed: {e}")
            return False

    async def _idle_ping_loop(self):
        """Send periodic background UDP pings when no formal test is running."""
        await asyncio.sleep(1)
        while self.running and self.ws:
            try:
                if not self.test_running:
                    client = UDPTestClient(
                        host=self.config["udp_server_host"],
                        port=self.config["udp_server_port"],
                        timeout_ms=500,
                    )
                    res = await client.send_packet(0)
                    client.close()
                    if res and res.get("rtt") is not None:
                        await self.ws.send(json.dumps({
                            "type": "idle_ping",
                            "rtt": round(res["rtt"], 2),
                            "timestamp": time.time(),
                        }))
            except Exception:
                pass
            await asyncio.sleep(1.5)

    async def _listen(self):
        """Continuous background listener that keeps WebSocket frames and messages flowing."""
        while self.running and self.ws:
            try:
                message = await self.ws.recv()
                data = json.loads(message)
                await self.command_queue.put(data)
            except websockets.ConnectionClosed:
                print("[!] Connection closed by server", flush=True)
                await self.command_queue.put(None)
                break
            except Exception as e:
                print(f"[!] Error reading message: {e}", flush=True)
                await self.command_queue.put(None)
                break

    async def run(self):
        """Main agent loop — listen for commands and execute."""
        print("[*] Waiting for commands from dashboard...", flush=True)
        self.command_queue = asyncio.Queue()
        listen_task = asyncio.create_task(self._listen())
        idle_task = asyncio.create_task(self._idle_ping_loop())

        try:
            while self.running:
                data = await self.command_queue.get()
                if data is None:
                    break
                print(f"[*] Received message from dashboard: {data.get('type')}", flush=True)
                await self.handle_command(data)
        finally:
            listen_task.cancel()
            idle_task.cancel()

    async def handle_command(self, data):
        """Handle incoming commands from the backend."""
        cmd_type = data.get("type")

        if cmd_type == "start_test":
            await self.run_test()

        elif cmd_type == "stop_test":
            print("[*] Test stopped by dashboard", flush=True)

        elif cmd_type == "enable_mitigation":
            self.mitigation_enabled = True
            self.jitter_buffer = JitterBuffer(
                min_depth_ms=self.config["jitter_buffer_min_ms"],
                max_depth_ms=self.config["jitter_buffer_max_ms"],
                playout_interval_ms=self.config["packet_interval_ms"],
            )
            print("[*] Mitigation ENABLED (adaptive jitter buffer active)")
            await self.ws.send(json.dumps({
                "type": "mitigation_status",
                "enabled": True,
            }))

        elif cmd_type == "disable_mitigation":
            self.mitigation_enabled = False
            self.jitter_buffer = None
            print("[*] Mitigation DISABLED")
            await self.ws.send(json.dumps({
                "type": "mitigation_status",
                "enabled": False,
            }))

        elif cmd_type == "start_experiment":
            await self.run_experiment(data)

        elif cmd_type == "reload_schedule":
            # Schedule reloaded for Test B — handled by start_experiment
            pass

        elif cmd_type == "revoked":
            print(f"[!] Agent credential revoked: {data.get('message')}")
            delete_credentials()
            self.running = False

        else:
            print(f"[?] Unknown command: {cmd_type}")

    async def _run_streamed_test(self, test_config, buffer=None, phase_name=None):
        """Internal helper to stream UDP test packets asynchronously in real-time."""
        self.test_running = True
        try:
            if buffer:
                buffer.reset()

            host = test_config["udp_target_host"]
            port = test_config["udp_target_port"]
            count = test_config["packet_count"]
            interval_ms = test_config["packet_interval_ms"]

            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(0.5)

            results = []
            rtt_values = []
            packets_sent = 0
            packets_received = 0
            current_batch = []
            batch_size = 5

            for seq in range(1, count + 1):
                send_time = time.time() * 1000  # ms
                packet = json.dumps({
                    "seq": seq,
                    "sendTimestamp": send_time,
                }).encode()

                try:
                    sock.sendto(packet, (host, port))
                    packets_sent += 1

                    try:
                        data, _ = sock.recvfrom(4096)
                        recv_time = time.time() * 1000
                        response = json.loads(data.decode())

                        rtt = recv_time - send_time
                        rtt_values.append(rtt)
                        packets_received += 1

                        result = {
                            "seq": seq,
                            "rtt": round(rtt, 4),
                            "send_time": send_time,
                            "recv_time": recv_time,
                            "server_timestamp": response.get("serverTimestamp"),
                            "applied_delay": response.get("appliedDelayMs", 0),
                            "status": "received",
                        }

                        if buffer is not None:
                            buf_result = buffer.receive_packet(seq, recv_time, result)
                            result["buffer_status"] = buf_result["status"]

                    except socket.timeout:
                        result = {
                            "seq": seq,
                            "rtt": None,
                            "send_time": send_time,
                            "recv_time": None,
                            "status": "timeout",
                        }
                except Exception as e:
                    result = {
                        "seq": seq,
                        "rtt": None,
                        "status": "error",
                        "error": str(e),
                    }

                results.append(result)
                current_batch.append(result)

                if len(current_batch) >= batch_size or seq == count:
                    rtt_batch = [r["rtt"] for r in current_batch if r.get("rtt") is not None]
                    batch_metrics = calculate_metrics(rtt_batch) if rtt_batch else {}
                    try:
                        await self.ws.send(json.dumps({
                            "type": "measurement",
                            "phase": phase_name,
                            "batch": current_batch,
                            "batchMetrics": batch_metrics,
                            "progress": round(seq / count, 2),
                            "mitigationEnabled": buffer is not None,
                            "bufferStats": buffer.get_stats() if buffer else None,
                        }))
                    except Exception:
                        pass
                    current_batch = []

                elapsed = (time.time() * 1000) - send_time
                sleep_ms = max(0, interval_ms - elapsed)
                if sleep_ms > 0:
                    await asyncio.sleep(sleep_ms / 1000)

            sock.close()

            # Calculate metrics
            packet_loss = ((packets_sent - packets_received) / packets_sent * 100) if packets_sent > 0 else 0
            metrics = calculate_metrics(rtt_values)
            metrics["packets_sent"] = packets_sent
            metrics["packets_received"] = packets_received
            metrics["packet_loss_percent"] = round(packet_loss, 2)

            if buffer is not None:
                current_time = time.time() * 1000
                while True:
                    playout_result = buffer.playout(current_time)
                    if playout_result is None:
                        break
                    current_time += buffer.playout_interval_ms
                metrics["buffer_stats"] = buffer.get_stats()

            return results, metrics
        finally:
            self.test_running = False

    async def run_test(self):
        """Run a single ad-hoc UDP test with live streaming."""
        print(f"\n[*] Starting UDP test ({self.config['packet_count']} packets)...", flush=True)

        buffer = self.jitter_buffer if self.mitigation_enabled else None
        results, metrics = await self._run_streamed_test(self.config, buffer=buffer)

        await self.ws.send(json.dumps({
            "type": "test_complete",
            "metrics": metrics,
            "mitigationEnabled": self.mitigation_enabled,
        }))

    async def run_experiment(self, data):
        """Run a paired A/B experiment with deterministic impairment."""
        experiment_id = data.get("experimentId")
        config = data.get("config", {})

        print(f"\n[*] Starting Paired Experiment: {experiment_id}", flush=True)
        print(f"    Impairment: base={config.get('baseDelayMs')}ms, "
              f"jitter=±{config.get('randomJitterMs')}ms, "
              f"loss={config.get('packetLossPercent')}%", flush=True)

        test_config = self.config.copy()
        test_config["packet_count"] = config.get("packetCount", test_config["packet_count"])

        # ---- TEST A: Mitigation OFF ----
        print("\n[*] === TEST A: Mitigation OFF ===", flush=True)
        results_a, metrics_a = await self._run_streamed_test(test_config, buffer=None, phase_name="A")

        await self.ws.send(json.dumps({
            "type": "experiment_results",
            "experimentId": experiment_id,
            "testPhase": "A",
            "results": metrics_a,
            "mitigationEnabled": False,
        }))

        print(f"    [A] Avg RTT: {metrics_a.get('avg_rtt', 'N/A')} ms", flush=True)
        print(f"    [A] RTT Variation: {metrics_a.get('avg_rtt_variation', 'N/A')} ms", flush=True)
        print(f"    [A] Packet Loss: {metrics_a.get('packet_loss_percent', 'N/A')}%", flush=True)

        await asyncio.sleep(1)

        # Notify backend to reload schedule for Test B
        await self.ws.send(json.dumps({
            "type": "reload_schedule_request",
            "experimentId": experiment_id,
        }))
        await asyncio.sleep(0.5)

        # ---- TEST B: Mitigation ON ----
        print("\n[*] === TEST B: Mitigation ON ===", flush=True)
        buffer = JitterBuffer(
            min_depth_ms=self.config["jitter_buffer_min_ms"],
            max_depth_ms=self.config["jitter_buffer_max_ms"],
            playout_interval_ms=self.config["packet_interval_ms"],
        )
        results_b, metrics_b = await self._run_streamed_test(test_config, buffer=buffer, phase_name="B")

        await self.ws.send(json.dumps({
            "type": "experiment_results",
            "experimentId": experiment_id,
            "testPhase": "B",
            "results": metrics_b,
            "mitigationEnabled": True,
        }))

        print(f"    [B] Avg RTT: {metrics_b.get('avg_rtt', 'N/A')} ms", flush=True)
        print(f"    [B] RTT Variation: {metrics_b.get('avg_rtt_variation', 'N/A')} ms", flush=True)
        print(f"    [B] Packet Loss: {metrics_b.get('packet_loss_percent', 'N/A')}%", flush=True)
        bs = metrics_b.get("buffer_stats", {})
        print(f"    [B] Buffer Depth: {bs.get('target_depth_ms', 'N/A')} ms", flush=True)
        print(f"    [B] Effective Delivery Var: {bs.get('effective_delivery_variation', 'N/A')} ms", flush=True)
        print(f"    [B] Dropped (late): {bs.get('packets_dropped_late', 0)}", flush=True)
        print("\n[✓] Paired experiment complete. Results sent to dashboard.", flush=True)

    async def run_with_reconnect(self):
        """Run agent with automatic reconnection."""
        backoff = 1
        max_backoff = 30

        while self.running:
            try:
                connected = await self.connect()

                if connected:
                    backoff = 1  # Reset backoff on successful connect
                    await self.run()
            except websockets.ConnectionClosed as e:
                print(f"[*] Connection dropped ({e}). Auto-reconnecting...", flush=True)
            except Exception as e:
                print(f"[!] Agent error: {e}. Auto-reconnecting...", flush=True)

            if not self.running:
                break

            print(f"[*] Reconnecting in {backoff}s...")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)

        print("[*] Agent shut down.")


# ----------------------------------------------------------
# Entry Point
# ----------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Network Jitter Agent — Measures network jitter via UDP",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
First-time setup:
  python network_agent.py --code A7X2K9

Normal startup (after pairing):
  python network_agent.py

Reset credentials:
  python network_agent.py --reset
        """
    )
    parser.add_argument("--code", help="Pairing code from the website (first-time only)")
    parser.add_argument("--reset", action="store_true", help="Delete stored credentials and re-pair")
    parser.add_argument("--config", help="Path to config.json file")
    args = parser.parse_args()

    # Handle reset
    if args.reset:
        delete_credentials()

    # Load config
    config = load_config()
    if args.config:
        with open(args.config, 'r') as f:
            config.update(json.load(f))

    # Create agent
    agent = NetworkAgent(config, pairing_code=args.code)

    print("=" * 50)
    print(f"  Network Jitter Agent v{VERSION}")
    print("=" * 50)

    creds = load_credentials()
    if creds and not args.code:
        print(f"[*] Found stored credentials (Agent: {creds['agent_id'][:8]}...)")
        print(f"[*] Will auto-connect to: {creds.get('backend_url', config['backend_url'])}")
    elif args.code:
        print(f"[*] First-time pairing with code: {args.code}")
    else:
        print("[*] No stored credentials found. Will prompt for pairing code.")

    print()

    # Run
    try:
        asyncio.run(agent.run_with_reconnect())
    except (KeyboardInterrupt, SystemExit):
        print("\n[*] Agent shut down gracefully.")
    except Exception as e:
        print(f"\n[!] Unexpected error: {e}")


if __name__ == "__main__":
    main()
