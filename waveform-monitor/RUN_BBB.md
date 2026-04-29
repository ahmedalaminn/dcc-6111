# BeagleBone Black Run Guide

This bundle is trimmed for the BeagleBone Black:

- runtime dependencies: `Flask`, `Jinja2`, and Debian `python3-numpy`
- no SciPy
- demo data included under `data/raw/sourceA` and `data/raw/sourceB`
- generated reports, metrics, and comparisons start empty

## 1. Copy and unzip on the BBB

Copy the zip to the board, then unpack it:

```bash
mkdir -p ~/waveform-monitor
cd ~/waveform-monitor
unzip waveform_monitor_bbb_bundle.zip
cd waveform_monitor_bbb_bundle
```

## 2. Install the minimal runtime

```bash
chmod +x scripts/setup_bbb.sh run_bbb.sh scripts/reset_demo_state.sh
./scripts/setup_bbb.sh
```

That script installs:

- `python3`
- `python3-venv`
- `python3-pip`
- `python3-numpy`

It then creates `.venv-bbb` and installs the light Python web dependencies.

It uses the board's existing Debian `python3`, so you do not need a separate manual upgrade to `python3.9`.

## 3. Start the service

```bash
./run_bbb.sh
```

The UI will be available at:

```text
http://<bbb-ip>:8000
```

If you are running locally on the board itself:

```text
http://127.0.0.1:8000
```

To find the BBB IP address from the board:

```bash
hostname -I
```

Use the non-loopback address shown there in place of `<bbb-ip>`.

To check whether port `8000` is already in use:

```bash
ss -ltn | grep :8000
```

If that prints nothing, port `8000` is free.

## 4. Demo flow

Use the included demo sources:

- `sourceA`
- `sourceB`

Recommended comparison demos:

- `sourceA/capture_001.bin` vs `sourceA/capture_003.bin`
- `sourceA/capture_001.bin` vs `sourceB/capture_001.bin`

## 5. Reset generated demo artifacts

This keeps the board storage clean between demos while preserving the raw example captures:

```bash
./scripts/reset_demo_state.sh
```

It clears only:

- `data/metrics/*`
- `data/comparisons/*`
- `data/reports/*`

It does not touch `data/raw`.

## 6. Optional environment overrides

`run_bbb.sh` already sets BBB-safe defaults if you do not provide them:

```text
MAX_SAMPLES=200000
MAX_FFT_SAMPLES=131072
MAX_ALIGNMENT_SAMPLES=50000
MAX_COMPARE_SAMPLES=50000
MAX_FILE_SIZE_MB=64
HOST=0.0.0.0
PORT=8000
```

To override one temporarily:

```bash
PORT=8080 ./run_bbb.sh
```

You normally do not edit `app/main.py` for this. `HOST` and `PORT` are read from the environment. If you want to change the default permanently, edit `run_bbb.sh`.
