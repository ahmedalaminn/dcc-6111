# Release Notes — SLB Distributed PubSub Network Logger

## Version 1.0 — Initial Release

**Release Date:** April 2026
**Platform:** BeagleBone Black (ARM Cortex-A8, 512 MB RAM, Debian Linux); development supported on Linux / macOS

---

## New Features

This is the first release. The following primary features were developed by the team:

### ZeroMQ Publish-Subscribe Broker
- A ZeroMQ XSUB/XPUB proxy (`broker.py`) routes messages from any number of publisher nodes to any number of subscribers.
- Publishers connect to the XSUB port (5556); subscribers connect to the XPUB port (5555).
- No configuration required beyond specifying the broker host and port on the publisher and server command lines.

### Publisher Nodes
- `publisher.py` generates and transmits log messages encoded with a lightweight Protocol Buffer schema (`log_message_pb2.py`).
- Configurable node ID, publish interval, message count, payload template, and broker endpoint via CLI flags.
- Can run on the BBB, a development machine, or any machine on the same LAN.

### Flask Dashboard Server with Server-Sent Events (SSE)
- `server.py` subscribes to the ZMQ broker and pushes live log events to connected browsers via SSE — no WebSocket dependency.
- Tracks up to 5 concurrent publisher nodes; nodes missing for more than 10 seconds are marked **LOST** and re-admitted when they reconnect.
- Maintains a bounded in-memory log ring (200 entries) to prevent unbounded memory growth on the BBB.
- SSE keepalive heartbeat (15 s) prevents proxies and browsers from dropping idle connections.
- All dashboard state is served from a single Jinja2 HTML template (`templates/index.html`) — no Node.js, npm, or React required on the BBB.

### Demo Mode
- `python3 server.py --demo` generates synthetic node traffic without requiring a running broker or any publishers. Useful for UI validation in isolation.

### Protobuf Serialization (Lightweight Stub)
- Messages are serialized using a minimal Protocol Buffer schema (`proto/log_message.proto`).
- The generated binding (`proto/log_message_pb2.py`) is a lightweight local stub — the `google-protobuf` package is **not** required at runtime, keeping the dependency footprint small on the BBB.

### React Frontend (Development Only)
- A Vite + React UI (`project2/src/`) provides a richer development-time dashboard experience.
- The React app proxies API calls to the Flask server on port 5001.
- **This frontend is for development only and must not be installed on the BeagleBone Black.**

### BeagleBone Black Deployment Support
- `run_bbb_broker.sh` and `run_bbb_server.sh` start the broker and server with BBB-safe defaults.
- Dependencies can be installed from Debian packages (`apt-get install python3-flask python3-zmq`) to avoid native compilation on-device.
- Conservative pinned dependency versions (`Flask>=2.2,<2.3`, `pyzmq>=22,<25`) ensure compatibility with the BBB's Debian Bullseye environment.

---

## Bug Fixes

The following bugs were identified and resolved during development:

| # | Bug | Root Cause | Fix |
|---|---|---|---|
| 1 | **Merge conflict in `HOWTORUN.md`** between team branches produced a partially-garbled document | Two team members independently authored significant additions to `HOWTORUN.md` on separate branches; git could not auto-merge them | Resolved manually by keeping the comprehensive version that included the full BBB deployment guide, dev machine instructions, CLI options table, and firewall port reference |
| 2 | **Merge conflict in `requirements.txt`** resulted in a file containing both the conservative BBB-safe versions and broader dev versions | Same branch divergence as above | Resolved by keeping the BBB-safe conservative pin range (`Flask>=2.2,<2.3`, `pyzmq>=22,<25`) to maintain BBB compatibility |

---

## Known Bugs and Defects

| # | Issue | Impact | Workaround |
|---|---|---|---|
| 1 | **Node count is capped at 5** — new publisher nodes are silently rejected when 5 are already tracked | Attempting to add a sixth node while five are active does not produce an error visible in the browser | Increase `MAX_NODES` in `server.py` before starting the server, or stop one of the existing publishers to free a slot |
| 2 | **Log ring is not persisted to disk** — the 200-entry in-memory log is lost when the server process restarts | Loss of historical log data across server restarts | Pipe server stdout to a log file: `python3 server.py ... >> logs/server.log 2>&1` |
| 3 | **React frontend dev proxy is hardcoded to port 5001** | Running the Flask server on any port other than 5001 breaks the React dev proxy | When running the full dev stack, always start the Flask server with `--port 5001` |
| 4 | **No authentication on the dashboard** | Any machine on the same network that can reach port 5000 can view the live log dashboard | Restrict access with firewall rules (`ufw`) or run the service on a private LAN segment |
| 5 | **Demo mode does not simulate node LOST / reconnect events** | Demo mode generates steady synthetic traffic; it cannot be used to test the LOST state or re-admission behavior | Test LOST state by killing a live publisher process and observing the dashboard after the 10-second timeout |
