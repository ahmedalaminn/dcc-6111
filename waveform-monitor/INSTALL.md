# Installation Guide — Waveform Monitor and Comparator

---

## Prerequisites

### Hardware

| Target | Specification |
|---|---|
| **Development / Lab machine** | Any x86-64 or ARM64 machine running Linux or macOS |
| **Embedded target (primary)** | BeagleBone Black — ARM Cortex-A8 @ 1 GHz, 512 MB RAM, running Debian Linux (Buster or Bullseye) |

The application has been validated on:
- Ubuntu 22.04 / 24.04 (x86-64)
- macOS 13+ (x86-64 and Apple Silicon)
- BeagleBone Black running Debian 10 (Buster)

### Software — Development / Lab Machine

| Requirement | Minimum Version | Download |
|---|---|---|
| Python | 3.9 | https://www.python.org/downloads/ |
| pip | 21.0 | Included with Python 3.9+; upgrade with `python3 -m pip install --upgrade pip` |
| git | 2.x | https://git-scm.com/downloads |

Verify your installation:
```bash
python3 --version   # must be 3.9 or higher
pip3 --version
git --version
```

### Software — BeagleBone Black

The BBB setup script handles all system-level dependencies automatically (see [BeagleBone Black Installation](#beaglebone-black-installation) below). No manual pre-installation is required beyond a working Debian image and internet connectivity.

The BBB deployment path uses the Debian-packaged `python3` that already ships with the board image:
- Debian 10 (Buster): Python 3.7
- Debian 11 (Bullseye): Python 3.9

You do not need to manually upgrade the board to `python3.9` just to run the service.

---

## Dependent Libraries

### Python packages (installed automatically by pip)

| Library | Version | Purpose | Link |
|---|---|---|---|
| Flask | ≥ 2.2 | HTTP server and REST API | https://flask.palletsprojects.com/ |
| NumPy | ≥ 1.21 | Signal processing, FFT, cross-correlation | https://numpy.org/ |
| Jinja2 | ≥ 3.0 | HTML report templating | https://jinja.palletsprojects.com/ |

No SciPy, no database, no message broker. All persistent state is stored as flat files (CSV, JSON, HTML).

For development/testing only:

| Library | Version | Purpose |
|---|---|---|
| pytest | ≥ 7.0 | Unit test runner |
| pytest-cov | ≥ 4.0 | Code coverage reporting |

---

## Download Instructions

Clone the repository from GitHub:

```bash
git clone https://github.com/ahmedalaminn/dcc-6111.git
cd dcc-6111/waveform-monitor
```

If you do not have git, you can download a ZIP archive from the repository's GitHub page using the **Code → Download ZIP** button, then extract it:

```bash
unzip dcc-6111-main.zip
cd dcc-6111-main/waveform-monitor
```

---

## Build Instructions

This project is pure Python — no compilation step is required. The installation steps below create a virtual environment and install the Python dependencies, which is all that is needed before running.

---

## Installation

### Local / Development Machine

1. Create and activate a Python virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate        # Linux / macOS
# venv\Scripts\activate         # Windows (not a supported target)
```

2. Install runtime dependencies:

```bash
pip install -r requirements.txt
```

3. (Optional) Install development and test tools:

```bash
pip install -r requirements-dev.txt
```

4. Make helper scripts executable:

```bash
chmod +x run_bbb.sh scripts/setup_bbb.sh scripts/reset_demo_state.sh
```

5. Verify the installation by generating the built-in demo dataset:

```bash
python3 scripts/generate_test_waveform.py --generate-default-set
```

This writes synthetic WAVE v1 `.bin` files to `data/raw/sourceA/` and `data/raw/sourceB/`. If the command completes without errors, the environment is working correctly.

---

### BeagleBone Black Installation

#### Step 1 — Transfer the project to the BBB

From your development machine (replace `192.168.1.x` with your BBB's IP address):

```bash
scp -r dcc-6111/waveform-monitor debian@192.168.1.x:~/waveform-monitor
```

Or clone directly on the BBB if internet is available:

```bash
ssh debian@192.168.1.x
git clone https://github.com/ahmedalaminn/dcc-6111.git
cd dcc-6111/waveform-monitor
```

#### Step 2 — Run the setup script

```bash
chmod +x scripts/setup_bbb.sh run_bbb.sh scripts/reset_demo_state.sh
./scripts/setup_bbb.sh
```

This script:
- Installs `python3`, `python3-venv`, `python3-pip`, and `python3-numpy` from the Debian package repository via `apt` (uses the OS-provided NumPy to avoid compiling native extensions on-device).
- Creates a `.venv-bbb` virtual environment.
- Installs the BBB-safe Flask/Jinja2 pins from `requirements-bbb.txt` inside that environment.

The script requires `sudo` for the `apt install` step and will prompt for the `debian` user password (default: `temppwd`).

#### Step 3 — Generate demo data (optional)

```bash
source .venv-bbb/bin/activate
python3 scripts/generate_test_waveform.py --generate-default-set
```

---

## Run Instructions

### Starting the Service

**BeagleBone Black (and Linux in general):**

```bash
./run_bbb.sh
```

**Development machine (after activating venv):**

```bash
source venv/bin/activate
python3 -m app.main
```

The web interface is available at:

```
http://localhost:8000          # from the same machine
http://<device-ip>:8000       # from another machine on the same network
```

### Configuration

`run_bbb.sh` exports the following environment variables before starting. Override any of them at launch:

| Variable | Default | Description |
|---|---|---|
| `MAX_SAMPLES` | 200000 | Global sample cap per waveform |
| `MAX_FFT_SAMPLES` | 131072 | FFT input cap (power-of-2 limit) |
| `MAX_ALIGNMENT_SAMPLES` | 50000 | Cross-correlation stride limit |
| `MAX_COMPARE_SAMPLES` | 50000 | Comparison sample cap |
| `MAX_FILE_SIZE_MB` | 64 | Upload size limit |
| `HOST` | 0.0.0.0 | Bind address (0.0.0.0 = all interfaces) |
| `PORT` | 8000 | HTTP port |

Example — run on a non-default port:

```bash
PORT=8080 ./run_bbb.sh
```

### Running as a Background Service (BBB)

To keep the service running after SSH disconnect:

```bash
nohup ./run_bbb.sh > logs/waveform.log 2>&1 &
echo $! > logs/waveform.pid
```

To stop it:

```bash
kill $(cat logs/waveform.pid)
```

---

## Troubleshooting

### `python3: command not found`

Python 3 is not installed or not on the PATH.

- **Linux (Debian/Ubuntu):** `sudo apt install python3 python3-pip python3-venv`
- **macOS:** Install from https://www.python.org/downloads/ or via Homebrew: `brew install python3`

---

### `ModuleNotFoundError: No module named 'flask'` (or `numpy`, `jinja2`)

The virtual environment is not activated, or `pip install` was not run inside it.

```bash
source venv/bin/activate          # dev machine
# or
source .venv-bbb/bin/activate     # BeagleBone Black

pip install -r requirements.txt
```

---

### Port 8000 already in use

Another process is occupying port 8000.

```bash
# Find the process
lsof -i :8000

# Kill it, or start on a different port
PORT=8080 ./run_bbb.sh
```

---

### `Permission denied` running `run_bbb.sh` or `setup_bbb.sh`

The scripts are not marked executable.

```bash
chmod +x run_bbb.sh scripts/setup_bbb.sh scripts/reset_demo_state.sh
```

---

### `setup_bbb.sh` fails at `apt install` (BBB)

The BBB does not have internet access or the package list is stale.

```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip python3-numpy
```

If the BBB has no internet, pre-install the packages on a connected machine and transfer the wheel files:

```bash
# On dev machine
pip download -r requirements-bbb.txt -d ./wheelhouse

# Transfer and install on BBB
scp -r wheelhouse debian@<bbb-ip>:~/wheelhouse
ssh debian@<bbb-ip>
pip install --no-index --find-links=~/wheelhouse -r ~/waveform-monitor/requirements-bbb.txt
```

### `pip install -r requirements.txt` fails on the BBB or asks for newer Python

`requirements.txt` is the development-machine dependency set. On older BBB images it may resolve package versions that require newer Python than the board ships with.

Use the BBB runtime path instead:

```bash
./scripts/setup_bbb.sh
```

Or, if the virtual environment already exists:

```bash
source .venv-bbb/bin/activate
pip install -r requirements-bbb.txt
```

Do not replace the board's system Python just to run `waveform-monitor`; the BBB path is intended to work with Debian 10/Buster and Debian 11/Bullseye as-is.

---

### Waveform uploads fail silently or return an error

- Confirm the file is a valid WAVE v1 `.bin` (generated by `scripts/generate_test_waveform.py`) or a raw uint8 `.bin` with a companion `.meta.json` sidecar in the same directory.
- Check that the file is under `MAX_FILE_SIZE_MB` (default 64 MB).
- Inspect the Flask console output for a traceback — the server logs the error even when the UI does not display it.

---

### Metrics all show N/A or zero after ingest

This is almost always caused by a format mismatch: a WAVE v1 file being parsed as raw uint8 (or vice versa).

- WAVE v1 files begin with the ASCII bytes `WAVE` — verify with `xxd data/raw/<source>/<file>.bin | head -1`.
- If a `.meta.json` sidecar exists alongside a WAVE v1 `.bin`, the parser will route it through the raw uint8 path. Remove the sidecar or move it.

---

### BeagleBone Black is slow or unresponsive during FFT / comparison

The default sample caps are already tuned for the BBB. If you are seeing timeouts:

```bash
# Reduce the comparison and FFT sample limits
MAX_FFT_SAMPLES=65536 MAX_COMPARE_SAMPLES=25000 ./run_bbb.sh
```

For very long captures, pre-downsample the binary before ingestion using `scripts/generate_test_waveform.py` with a lower `--sample-rate`.
