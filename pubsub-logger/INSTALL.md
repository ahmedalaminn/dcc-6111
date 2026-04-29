# Installation Guide — SLB Distributed PubSub Network Logger

---

## Prerequisites

### Hardware

| Target | Specification |
|---|---|
| **BeagleBone Black (primary)** | ARM Cortex-A8 @ 1 GHz, 512 MB RAM, Debian Linux (Buster or Bullseye) |
| **Development machine** | Any x86-64 or ARM64 machine running Linux, macOS, or WSL2 |

The system is designed as a distributed deployment:
- The **BBB** runs the ZMQ broker and the Flask dashboard server.
- **Remote machines** (dev laptop, other Linux boards) run publisher nodes and connect to the BBB broker over the network.

### Software — BeagleBone Black

| Requirement | Minimum Version | Notes |
|---|---|---|
| Debian Linux | Buster (10) or Bullseye (11) | Bullseye ships Python 3.9 and is recommended |
| Python | 3.8+ | Check with `python3 --version`; Bullseye ships 3.9 |
| pip | any | Included with Python; may need `sudo apt install python3-pip` |
| libzmq | 4.x | Installed via `apt-get install libzmq3-dev` |

### Software — Development Machine (Linux / macOS / WSL2)

| Requirement | Minimum Version | Download |
|---|---|---|
| Python | 3.8+ | https://www.python.org/downloads/ |
| pip | any | Included with Python |
| Node.js | 18+ (React frontend only) | https://nodejs.org/en/download |
| npm | 9+ (React frontend only) | Included with Node.js |

> The React frontend is **optional** and only needed during development. The Flask template UI (`templates/index.html`) is the recommended interface for the BBB deployment.

---

## Dependent Libraries

### Python packages

| Library | Version | Purpose | Link |
|---|---|---|---|
| Flask | ≥ 2.2, < 2.3 | HTTP server and SSE dashboard | https://flask.palletsprojects.com/ |
| pyzmq | ≥ 22, < 25 | ZeroMQ Python bindings | https://pyzmq.readthedocs.io/ |

No `protobuf` package is required. The protobuf binding (`proto/log_message_pb2.py`) is a lightweight local stub included in the repository.

### Node.js packages (development React frontend only)

Installed automatically by `npm install`. Key dependencies:

| Library | Purpose |
|---|---|
| React 18 | UI framework |
| Vite | Development bundler and dev server |
| MUI / Radix UI | Component library |
| Recharts | Dashboard charting |

---

## Download Instructions

Clone the repository from GitHub:

```bash
git clone https://github.com/ahmedalaminn/dcc-6111.git
cd dcc-6111/pubsub-logger
```

If you do not have git, download a ZIP archive from the repository's GitHub page using **Code → Download ZIP**, then extract it:

```bash
unzip dcc-6111-main.zip
cd dcc-6111-main/pubsub-logger
```

---

## Build Instructions

This project is pure Python on the backend — no compilation step is required for the server or broker. The React frontend requires a build step only if you intend to serve a production bundle (not needed for the BBB deployment).

### React frontend build (optional, development only)

```bash
cd pubsub-logger
npm install
npm run build   # outputs to dist/
```

---

## Installation

### BeagleBone Black Installation

#### Step 1 — Transfer the project to the BBB

From your development machine:

```bash
scp -r dcc-6111/pubsub-logger debian@<bbb-ip>:~/pubsub-logger
```

Or clone directly on the BBB if internet is available:

```bash
ssh debian@<bbb-ip>
git clone https://github.com/ahmedalaminn/dcc-6111.git
cd dcc-6111/pubsub-logger/python
```

#### Step 2 — Install system packages (preferred method)

Installing from Debian packages avoids compiling native extensions on the BBB:

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv libzmq3-dev
```

Try the Debian-provided Python bindings first (no pip compile needed):

```bash
sudo apt-get install -y python3-flask python3-zmq
```

If the Debian packages are available, you can skip the pip steps below.

#### Step 3 — Create a virtual environment and install Python packages (fallback)

If the Debian packages are not available or you need a specific version:

```bash
cd ~/dcc-6111/pubsub-logger/python
python3 -m venv .venv
source .venv/bin/activate
pip install --no-cache-dir -r requirements.txt
```

#### Step 4 — Make run scripts executable

```bash
chmod +x run_bbb_broker.sh run_bbb_server.sh
```

---

### Development Machine Installation

```bash
cd dcc-6111/pubsub-logger/python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

For the React frontend:

```bash
cd dcc-6111/pubsub-logger
npm install
```

---

## Run Instructions

### Running on the BeagleBone Black

Open three SSH sessions into the BBB (or use `screen` / `tmux`).

**Terminal 1 — ZMQ Broker**

```bash
cd ~/dcc-6111/pubsub-logger
./run_bbb_broker.sh
```

Or manually:

```bash
cd ~/dcc-6111/pubsub-logger/python
source .venv/bin/activate
python3 broker.py
```

Listens on:
- `tcp://0.0.0.0:5556` — publishers connect here
- `tcp://0.0.0.0:5555` — server connects here

**Terminal 2 — Flask Dashboard Server**

```bash
cd ~/dcc-6111/pubsub-logger
./run_bbb_server.sh
```

Or manually:

```bash
cd ~/dcc-6111/pubsub-logger/python
source .venv/bin/activate
python3 server.py --endpoint tcp://127.0.0.1:5555 --host 0.0.0.0 --port 5000
```

Dashboard available at: `http://<bbb-ip>:5000`

**Terminal 3+ — Publisher Nodes**

On the BBB or any machine on the same LAN:

```bash
python3 publisher.py node-alpha --endpoint tcp://<bbb-ip>:5556
python3 publisher.py node-beta  --endpoint tcp://<bbb-ip>:5556
```

Publishers on the BBB itself can use `localhost`:

```bash
python3 publisher.py node-local
```

**View the Dashboard**

Open a browser on any machine on the same network:

```
http://<bbb-ip>:5000
```

To find the BBB's IP: `ip addr show` or `hostname -I`

---

### Demo Mode (No Broker or Publisher Needed)

```bash
python3 server.py --demo --host 0.0.0.0 --port 5000
```

Generates synthetic node traffic and serves the dashboard. Useful for verifying the UI without a live deployment.

---

### Full Dev Stack with React Frontend (Development Machine)

Run four processes in separate terminals:

```bash
# Terminal 1 — Broker
cd pubsub-logger/python && source .venv/bin/activate && python3 broker.py

# Terminal 2 — Flask server (must be port 5001 for React proxy)
cd pubsub-logger/python && source .venv/bin/activate && python3 server.py --endpoint tcp://127.0.0.1:5555 --port 5001

# Terminal 3 — Publisher
cd pubsub-logger/python && source .venv/bin/activate && python3 publisher.py node-alpha

# Terminal 4 — React dev server
cd pubsub-logger && npm run dev
```

Open `http://localhost:5173`

---

### server.py CLI Options

| Flag | Default | Description |
|---|---|---|
| `--endpoint` | `tcp://127.0.0.1:5555` | ZMQ broker XPUB address to subscribe to |
| `--topic` | `""` (all) | ZMQ topic filter (empty = receive all messages) |
| `--host` | `0.0.0.0` | HTTP bind address |
| `--port` | `5000` | HTTP port |
| `--demo` | off | Use synthetic data instead of ZMQ |

---

## Firewall / Port Reference

| Port | Protocol | Used By |
|---|---|---|
| 5555 | TCP | ZMQ XPUB — server (subscriber) connects here |
| 5556 | TCP | ZMQ XSUB — publishers connect here |
| 5000 | TCP | Flask HTTP dashboard |

On BBB with `ufw` enabled:

```bash
sudo ufw allow 5000/tcp
sudo ufw allow 5555/tcp
sudo ufw allow 5556/tcp
```

---

## Troubleshooting

### `ModuleNotFoundError: No module named 'flask'` or `'zmq'`

The virtual environment is not activated or the packages were not installed.

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

---

### `zmq.error.ZMQError: Address already in use`

Another process (possibly a previous broker run) is already holding port 5555 or 5556.

```bash
# Find and kill the process
lsof -i :5555
kill <pid>
```

---

### Publisher connects but dashboard shows no messages

1. Confirm the broker is running and listening on both ports.
2. Confirm the publisher's `--endpoint` matches the broker's XSUB address (`tcp://<bbb-ip>:5556`).
3. Confirm the server's `--endpoint` matches the broker's XPUB address (`tcp://<bbb-ip>:5555`).
4. Confirm the BBB firewall allows ports 5555 and 5556 (see Firewall section above).

---

### Dashboard shows node as LOST immediately

The publisher is not sending messages within the 10-second timeout. Check:
- The publisher process is running.
- The publisher's `--endpoint` points to the correct broker host and port.
- Network connectivity between the publisher machine and the BBB.

---

### React dev server shows `ECONNREFUSED` / proxy errors

The Flask server must be running on port 5001 for the React proxy to work. Start it with `--port 5001`.

---

### `Permission denied` on `run_bbb_broker.sh` or `run_bbb_server.sh`

```bash
chmod +x run_bbb_broker.sh run_bbb_server.sh
```

---

### BBB is slow to install pip packages

Use the Debian system packages instead:

```bash
sudo apt-get install -y python3-flask python3-zmq
```

This skips PyPI entirely and uses pre-compiled packages from the Debian repo.
