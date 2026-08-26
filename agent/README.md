# Network Jitter Agent

Python agent that measures real network jitter via UDP packets and optionally applies application-level jitter mitigation using an adaptive buffer.

## What It Does

- Connects to the backend WebSocket server
- Sends UDP echo packets to the test server
- Measures **round-trip time (RTT)** per packet
- Calculates **RTT Variation** (our jitter metric): `abs(RTT_i - RTT_{i-1})`
- Calculates packet loss, min/max/avg RTT, standard deviation, percentiles
- Streams results live to the web dashboard
- Optionally activates an adaptive jitter buffer for application-level mitigation
- Supports paired A/B experiments with deterministic impairment

## Why a Local Agent?

Browsers cannot send raw UDP packets. The Python agent runs on your machine to perform real network measurements that a browser simply cannot do.

## Installation

### Option 1: Python Source (Recommended)

**Requirements:** Python 3.10+

```bash
cd agent
pip install -r requirements.txt
```

### Option 2: Windows Executable

Download `NetworkJitterAgent.exe` from the [GitHub Releases](../../releases) page. No Python installation needed.

To build the executable yourself:
```bash
cd agent
.\build_agent.bat    # Windows CMD
.\build_agent.ps1    # PowerShell
```

## First-Time Setup (Pair Once)

1. Open the website and go to the **Setup** page
2. Note the **pairing code** displayed (e.g., `A7X2K9`)
3. Start the agent with the code:

```bash
# Python source
python network_agent.py --code A7X2K9

# OR Windows executable
NetworkJitterAgent.exe --code A7X2K9
```

4. The agent connects and pairs with your browser session
5. Credentials are saved locally — **you won't need the code again**

## Normal Startup (After Pairing)

Just start the agent — it connects automatically:

```bash
python network_agent.py
```

That's it. No code, no configuration, no manual steps.

## Reset / Re-Pair

If you need to pair with a different session:

```bash
python network_agent.py --reset
```

This deletes stored credentials and prompts for a new pairing code.

## Configuration

Copy `config.example.json` to `config.json` and edit:

```json
{
  "backend_url": "ws://localhost:4000/ws/agent",
  "udp_target_host": "127.0.0.1",
  "udp_target_port": 5005,
  "packet_count": 200,
  "packet_interval_ms": 50,
  "jitter_buffer_min_ms": 20,
  "jitter_buffer_max_ms": 200
}
```

## Credential Storage

Credentials are stored at: `~/.networkjitter/credentials.json`

- Contains: agent ID and authentication token
- File permissions: user-only read/write (on Unix)
- Never committed to version control
- Delete this file to force re-pairing

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Connection refused` | Make sure the backend is running on the correct port |
| `Invalid or expired pairing code` | Get a fresh code from the website setup page |
| `Invalid or revoked agent token` | Use `--reset` to delete stored credentials and re-pair |
| `No module named websockets` | Run `pip install -r requirements.txt` |
| Agent won't reconnect | Check your internet connection; agent retries with exponential backoff |

## Platform Notes

### Windows
- Python: Download from [python.org](https://python.org)
- Or use the `.exe` from GitHub Releases

### macOS / Linux
```bash
python3 network_agent.py --code YOUR_CODE
```

## Running Tests

```bash
cd agent
python -m pytest tests/ -v
```
