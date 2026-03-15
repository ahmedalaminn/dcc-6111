# Project 2 — Pubsub Network and UI Logger

Linux microservice for a pubsub data network with a logger UI, deployable on BeagleBone Black–class embedded targets (512MB RAM, 4GB storage). Uses ZeroMQ (XPUB/XSUB); UI shows data by node with timestamps and a diagnostic logging toggle.

## Frontends (BBB-friendly)

Two frontend options that consume the same backend API:

| Frontend | Stack | BBB suitability | Notes |
|----------|--------|------------------|--------|
| **Tkinter** | Python stdlib (`tkinter` + `urllib`) | ✅ Recommended | No GPU, no extra pip deps. Runs on BBB with default Python. |
| **Web** | Flask serves HTML + SSE | ✅ Good | Headless: serve from BBB, view from any browser on the network. |
| **Dear PyGui** | Python + OpenGL | ⚠️ Optional | May require building from source on ARM; use Tkinter if unavailable. |

### Tkinter UI (recommended on device)

- **Zero extra dependencies** beyond the Python standard library.
- Connects to the backend over HTTP: SSE for live log/node updates, POST for diagnostic toggle.
- Run the backend first, then the Tk client:

```bash
cd frontend/python

# Terminal 1: backend (demo mode or real ZMQ)
pip3 install -r requirements.txt
python3 server.py --demo
# or: python3 server.py --endpoint tcp://192.168.1.10:5555

# Terminal 2: Tkinter UI
python3 main_tk.py
# or: python3 main_tk.py --url http://192.168.1.10:5000
```

- On BBB: run `server.py` (and ZMQ broker if separate), then `python3 main_tk.py --url http://127.0.0.1:5000` (or the LAN IP of the machine serving the backend).

### Web UI

- Backend serves a dashboard at `http://<host>:5000` and streams events via Server-Sent Events.
- Use when the UI is viewed from a laptop/tablet; the BBB only runs the backend (or backend + ZMQ).

### Dear PyGui UI

- `main.py` runs a native GUI that pulls from a message queue (same process or local ZMQ). Heavier and may need ARM build; prefer Tkinter on BBB.

## Backend API (implemented by client)

The frontend expects:

- **GET /stream** — Server-Sent Events: `log` (ts, node_id, payload, topic) and `node_status` (node_id, status).
- **POST /toggle** — Body `{"enabled": true|false}` to toggle diagnostic logging.

## Project layout

- `frontend/python/` — Backend (Flask + ZMQ subscriber), Tkinter UI, Dear PyGui UI, protobufs.
- `frontend/` (Vite/React) — Optional browser dashboard; for development or non-embedded use.

## BeagleBone Black notes (Debian 10 Buster, Python 3.7)

- **Use python3 / pip3**: On BBB, `python` is 2.7.16; all run commands in this repo use `python3` and `pip3`.
- **Python 3.7**: The Tkinter frontend (`gui_tk.py`, `main_tk.py`) is written for Python 3.7+ so it runs on Buster’s default Python. No 3.9+ syntax or ttk features (e.g. `padding=` on Frame) are used.
- **Install Tk on BBB**: `sudo apt-get install python3-tk` (Debian 10 has `python3-tk` for 3.7).
- **RAM**: 512MB — Tkinter and a single Flask process fit; avoid heavy browser or many tabs on the device.
- **Storage**: 4GB — Prefer the Tkinter frontend (no Node/npm or large JS bundles on device).
- **Display**: If the BBB has a small screen or HDMI, the Tkinter window scales; the web UI can be opened from another device.
