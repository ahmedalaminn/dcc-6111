# How to Run — SLB Distributed PubSub Network Logger

## Overview

The system has three independent processes that work together:

```
publisher(s) ──pub──> broker <──sub── server ──SSE──> browser dashboard
                (ZMQ proxy)     (Flask HTTP)
```

All Python files live in `pubsub-logger/python/`. Run commands from that directory unless noted otherwise.

---

## Prerequisites

### BeagleBone Black (BBB)

```bash
# System packages (one-time)
$ sudo apt-get update
$ sudo apt-get install -y python3 python3-pip python3-venv libzmq3-dev

# Create and activate a virtual environment
$ cd pubsub-logger/python
$ python3 -m venv .venv
$ source .venv/bin/activate

# Install Python dependencies
$ pip install -r requirements.txt
```

> **Python version:** Requires Python 3.8+. Check with `python3 --version`.  
> BBB running Debian 11 (Bullseye) ships Python 3.9 and is fully supported.  
> If you're on Debian 10 (Buster, Python 3.7), upgrade Python or use `pyenv`.

### Development Machine (Linux / macOS / WSL)

```bash
$ cd pubsub-logger/python
$ python3 -m venv .venv
$ source .venv/bin/activate
$ pip install -r requirements.txt
```

---

## Running on the BeagleBone Black

Open three SSH sessions (or `screen` / `tmux` panes) into the BBB.

### Terminal 1 — ZMQ Broker

```bash
$ cd ~/dcc-6111/pubsub-logger
$ ./run_bbb_broker.sh
```

Listens on:
- `tcp://0.0.0.0:5555` — subscribers (server.py connects here)
- `tcp://0.0.0.0:5556` — publishers (publisher.py connects here)

### Terminal 2 — Flask Server

```bash
$ cd ~/dcc-6111/pubsub-logger
$ ./run_bbb_server.sh
```

Serves the dashboard at `http://<BBB-IP>:5000` from any browser on the same LAN.

### Terminal 3+ — Publisher Node(s)

```bash
$ cd ~/dcc-6111/pubsub-logger
$ python3 python/publisher.py node-alpha
```

Run this in additional terminals (or on other machines) with different node names:

```bash
$ cd ~/dcc-6111/pubsub-logger
$ python3 python/publisher.py node-beta
```

```bash
$ cd ~/dcc-6111/pubsub-logger
$ python3 python/publisher.py node-gamma
```

Publishers on **remote machines** must point to the BBB's IP:

```bash
$ python3 python/publisher.py node-remote --endpoint tcp://<BBB-IP>:5556
```

### View the Dashboard

Open a browser on any machine on the same network:

```
http://<BBB-IP>:5000
```

To find the BBB's IP: `ip addr show` or `hostname -I`

---

## Demo Mode (No Publisher Needed)

Generates synthetic node traffic without requiring a broker or any publishers. Useful for testing the UI in isolation.

```bash
$ python3 server.py --demo --host 0.0.0.0 --port 5000
```

Then open `http://<BBB-IP>:5000` (or `http://localhost:5000` locally).

---

## server.py CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--endpoint` | `tcp://127.0.0.1:5555` | ZMQ broker address to subscribe to |
| `--topic` | `""` (all) | ZMQ topic filter (empty = receive all) |
| `--host` | `0.0.0.0` | HTTP bind address |
| `--port` | `5000` | HTTP port |
| `--demo` | off | Use synthetic data instead of ZMQ |

---

## Tunable Parameters (server.py)

| Constant | Default | Description |
|----------|---------|-------------|
| `MAX_NODES` | 5 | Max nodes tracked before rejecting new ones |
| `NODE_TIMEOUT_S` | 10.0 | Seconds without a message before node is marked LOST |
| `MAX_LOG_ROWS` | 200 | Max log entries kept in memory |
| `SSE_HEARTBEAT_S` | 15.0 | Keepalive heartbeat interval for SSE connections |

---

## Firewall / Port Reference

| Port | Protocol | Used By |
|------|----------|---------|
| 5555 | TCP | ZMQ XPUB — subscribers connect here |
| 5556 | TCP | ZMQ XSUB — publishers connect here |
| 5000 | TCP | Flask HTTP dashboard |

On BBB with `ufw` enabled:
```bash
$ sudo ufw allow 5000/tcp
$ sudo ufw allow 5555/tcp
$ sudo ufw allow 5556/tcp
```
