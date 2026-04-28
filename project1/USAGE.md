# Usage Guide — Waveform Monitor and Comparator

This document covers the day-to-day use of the system: the web UI, the CLI, the REST API, and how to interpret the metrics the system produces.

---

## Table of Contents

1. [Web UI Walkthrough](#1-web-ui-walkthrough)
2. [Ingesting a Waveform](#2-ingesting-a-waveform)
3. [Viewing Signal Metrics](#3-viewing-signal-metrics)
4. [Comparing Waveforms](#4-comparing-waveforms)
5. [Generating a Report](#5-generating-a-report)
6. [Interpreting the Metrics](#6-interpreting-the-metrics)
7. [CLI Reference](#7-cli-reference)
8. [REST API Reference](#8-rest-api-reference)
9. [File Formats](#9-file-formats)
10. [End-to-End Example](#10-end-to-end-example)

---

## 1. Web UI Walkthrough

Start the service (`./run_bbb.sh`) and open `http://<host>:8000` in a browser.

The UI is divided into a **sidebar** and a **tab panel**.

### Sidebar

| Element | Purpose |
|---|---|
| **Sources** list | Every subdirectory under `data/raw/` appears here. Click one to select it. |
| **Waveforms** list | Shows all `.bin` files for the selected source. Click one to load it. |

### Tabs

| Tab | What it shows |
|---|---|
| **Waveform** | Time-domain plot of the selected waveform. Y-axis uses the signal's stored units (e.g. V, ADC counts). X-axis is time in seconds. |
| **FFT Spectrum** | Frequency-domain magnitude plot, computed server-side via numpy `rfft` on the full capture (up to 131,072 samples). Downsampled to 512 display bins. |
| **Metrics Trend** | Line chart of key metrics (RMS, SNR, dominant frequency) plotted across all captures for the selected source — useful for spotting drift over time. |
| **Compare** | Multi-waveform comparison tool (see [§4](#4-comparing-waveforms)). |
| **Ingest** | Upload a new `.bin` file (see [§2](#2-ingesting-a-waveform)). |
| **Reports** | List and open previously generated HTML reports. |
| **Terminal** | In-browser CLI — runs the same commands as the command-line interface (see [§7](#7-cli-reference)). |

---

## 2. Ingesting a Waveform

### Via the web UI

1. Click the **Ingest** tab.
2. Choose your `.bin` file.
3. Set the **Source ID** (the folder name under `data/raw/` where the file will be stored). If left blank it defaults to the filename stem.
4. Set the **Format**:
   - `auto` — the system detects the format from the file header (recommended).
   - `wave` — force WAVE v1 (float32 with header).
   - `raw` — force raw uint8 ADC stream; also set **Sample Rate (Hz)** when using this.
5. Click **Ingest**. The system parses the file, computes all metrics, and appends them to `data/metrics/<source_id>_metrics.csv`.

### Via the CLI

```bash
# WAVE v1 file — format detected automatically
waveform-cli ingest data/raw/sourceA/capture_001.bin

# Raw uint8 ADC file with explicit sample rate
waveform-cli ingest data/raw/sourceA/capture_001.bin \
  --format raw --sample-rate 1000 --source sourceA
```

### Via curl

```bash
# WAVE v1 file
curl -X POST http://localhost:8000/api/ingest \
  -F "file=@capture_001.bin" \
  -F "source_id=sourceA"

# Raw uint8 file
curl -X POST http://localhost:8000/api/ingest \
  -F "file=@capture_001.bin" \
  -F "format=raw" \
  -F "sample_rate=1000" \
  -F "source_id=sourceA"
```

---

## 3. Viewing Signal Metrics

1. Click a **source** in the sidebar.
2. Click a **waveform file** in the sidebar.
3. The **Waveform** tab shows the time-domain plot and the **Signal Metrics** tile grid below it.
4. Click the **FFT Spectrum** tab to view the frequency-domain representation.
5. Click the **Metrics Trend** tab to see how metrics have changed across all captures for that source.

The metrics tile grid shows:

| Tile | What it means |
|---|---|
| Peak-to-Peak | Full swing of the signal (max − min) |
| RMS | Effective amplitude — for a pure sine wave this is amplitude / √2 |
| Mean | DC offset of the signal — near zero for a centered waveform |
| Std Dev | Spread of sample values — equal to RMS for a zero-mean signal |
| SNR (dB) | Signal-to-noise ratio — see [§6](#6-interpreting-the-metrics) for thresholds |
| Dom. Freq (Hz) | Peak FFT bin (DC excluded) — the dominant oscillation frequency |
| Damping Rate (s⁻¹) | How fast the signal envelope is decaying — see [§6](#6-interpreting-the-metrics) |
| Time Constant (s) | Seconds to decay to ~37% amplitude — only shown when damping rate > 0 |
| Samples | Total number of samples in the capture |
| Sample Rate | Capture sample rate in Hz |

---

## 4. Comparing Waveforms

1. Click the **Compare** tab.
2. For each slot (A, B, …) select a **source** then a **waveform file**. Slots are populated from the live source list — only sources with files appear.
3. Add up to 5 slots using **+ Add Waveform**.
4. Click **Run Comparison**.

The results panel shows:

- **Waveform Overlay** — all signals plotted together, color-coded by slot.
- **FFT Overlay** — frequency spectra of all signals overlaid.
- **Pairwise Metrics Table** — one row per pair:

  | Column | Description |
  |---|---|
  | RMSE | Root mean square error after time-alignment |
  | Correlation | Pearson correlation coefficient (1.0 = identical) |
  | Lag (samples) | How many samples A leads B; positive means A is ahead |
  | Phase Shift (°) | Lag expressed as a phase angle at the dominant frequency. Shows **N/A** when the two signals have dominant frequencies that differ by more than 10% — phase shift between different frequencies is not meaningful. |

- **Difference Plot** — sample-by-sample error between each pair after alignment.
- **Degradation Indicators** — any automatically flagged changes (amplitude, SNR, frequency, damping).

Comparisons are saved to `data/comparisons/` and can be attached to a report.

---

## 5. Generating a Report

### Via the web UI

1. Click the **Reports** tab.
2. Select a **Source** and optionally a **Comparison ID** from the dropdowns.
3. Click **Generate Report**. The report appears in the list below and can be opened directly in the browser.

### Via the CLI

```bash
waveform-cli report --source sourceA
waveform-cli report --source sourceA --comparison cmp_1777300885146
```

### Via curl

```bash
curl -X POST http://localhost:8000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"source_id": "sourceA"}'

# With a comparison attached
curl -X POST http://localhost:8000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"source_id": "sourceA", "comparison_id": "cmp_1777300885146"}'
```

Reports are written to `data/reports/report_<timestamp>.html` and are fully self-contained — no internet connection or external assets required to open them.

---

## 6. Interpreting the Metrics

### SNR (dB)

| Range | Meaning |
|---|---|
| > 20 dB | Clean signal — noise is well below the signal |
| 10–20 dB | Acceptable — some noise present |
| 0–10 dB | Noisy — worth investigating |
| < 0 dB | Noise power exceeds signal power — signal may be corrupted or the ADC gain is too high |

### Dominant Frequency

This is the FFT bin with the highest magnitude (DC bin excluded). For a 10 Hz sine captured at 1000 Hz it will read exactly `10.00 Hz`. If the signal is pure noise with no periodic component, the value will be an artifact of the noise floor and should be disregarded — use SNR to determine whether the dominant frequency is trustworthy.

### Damping Rate (s⁻¹)

The damping rate is estimated by fitting an exponential curve to the peaks of the signal's absolute-value envelope.

| Value | Meaning |
|---|---|
| ≈ 0 | Steady-state oscillation — no meaningful decay |
| > 0 | Signal is attenuating (e.g. a ringing transient dying out) |
| < 0 | Signal envelope is growing — possible instability or noise |
| N/A | Fewer than 3 detectable amplitude peaks — signal too short or too flat |

**Time Constant (s)** = 1 / damping rate. This is the time it takes for the amplitude to decay to approximately 37% of its initial value. Only shown when damping rate > 0.

### Phase Shift (°)

Phase shift is calculated from the cross-correlation alignment lag:

```
phase_shift = (lag_samples / sample_rate) × dominant_frequency × 360°
```

It is only meaningful when both signals share the same dominant frequency (within 10%). A phase shift of 90° means one signal is a quarter-cycle ahead of the other.

| Value | Meaning |
|---|---|
| 0° | Signals are in phase |
| ±90° | One signal leads the other by a quarter cycle |
| ±180° | Signals are fully inverted relative to each other |
| N/A | Dominant frequencies differ by more than 10% |

### Degradation Indicators

The system automatically flags the following conditions when comparing waveforms:

| Indicator | Threshold |
|---|---|
| Peak-to-peak amplitude change | > 20% from reference |
| SNR drop | > 3 dB below reference |
| Dominant frequency shift | > 10% from reference |
| Damping rate change | > 1.0 s⁻¹ from reference |
| RMSE vs baseline | > 30% of reference RMS |

---

## 7. CLI Reference

The Terminal tab in the web UI runs these same commands.

```bash
# List available sources
waveform-cli sources

# List waveforms for a source
waveform-cli waveforms --source sourceA

# Ingest a waveform file
waveform-cli ingest <file.bin> [--format auto|wave|raw] [--sample-rate Hz] [--source ID]

# Compute and print metrics for a waveform
waveform-cli analyze --input <file.bin>

# Compare two waveforms
waveform-cli compare --a <file_a.bin> --b <file_b.bin>

# Monitor a directory for new .bin files (ingests automatically)
waveform-cli monitor --dir ./incoming

# Generate an HTML report
waveform-cli report --source <source_id> [--comparison <cmp_id>]
```

---

## 8. REST API Reference

All endpoints return JSON. The base URL is `http://<host>:8000`.

### Sources and waveforms

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sources` | List all source IDs |
| `GET` | `/api/sources/<source_id>/waveforms` | List `.bin` files for a source |
| `GET` | `/api/sources/<source_id>/waveforms/<filename>` | Load a waveform — returns samples (downsampled to 1000 pts by default), FFT data, and all metrics |
| `GET` | `/api/sources/<source_id>/metrics` | Return full metrics history (CSV-backed) |

**Query parameters for waveform endpoint:**

| Parameter | Default | Description |
|---|---|---|
| `max_points` | `1000` | Maximum display sample points returned |

**Waveform response fields:**

```json
{
  "source_id": "sourceA",
  "filename": "capture_001.bin",
  "timestamp_ms": 1234567890000,
  "sample_rate": 1000.0,
  "display_sample_rate": 1000.0,
  "display_step": 1,
  "units": "V",
  "num_samples": 1000,
  "duration_s": 1.0,
  "samples": [...],
  "fft_freqs": [...],
  "fft_magnitudes": [...],
  "metrics": {
    "peak_to_peak": 2.10047,
    "rms": 0.70792,
    "mean": -0.00096,
    "std": 0.70792,
    "snr_db": 31.97,
    "dominant_freq_hz": 10.0,
    "damping_rate": -0.1107,
    "damping_time_constant_s": null,
    "num_samples": 1000
  }
}
```

### Ingest

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/ingest` | `multipart/form-data` | Upload and ingest a `.bin` file |

Form fields: `file` (required), `source_id`, `format` (`auto`/`wave`/`raw`), `sample_rate`.

### Compare

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/compare` | JSON | Compare two waveforms |
| `POST` | `/api/compare/multi` | JSON | Compare 2–5 waveforms |
| `GET` | `/api/comparisons` | — | List saved comparison IDs |

**`/api/compare` request body:**

```json
{
  "source_a": "sourceA",
  "filename_a": "capture_001.bin",
  "source_b": "sourceA",
  "filename_b": "capture_003.bin"
}
```

**`/api/compare/multi` request body:**

```json
{
  "waveforms": [
    {"source_id": "sourceA", "filename": "capture_001.bin"},
    {"source_id": "sourceA", "filename": "capture_002.bin"},
    {"source_id": "sourceB", "filename": "capture_001.bin"}
  ]
}
```

### Reports

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/reports/generate` | JSON | Generate an HTML report |
| `GET` | `/api/reports` | — | List saved report filenames |
| `GET` | `/api/reports/<filename>` | — | Serve a report file |
| `DELETE` | `/api/reports/<filename>` | — | Delete a report |

**`/api/reports/generate` request body:**

```json
{
  "source_id": "sourceA",
  "comparison_id": "cmp_1777300885146"
}
```

---

## 9. File Formats

### WAVE v1 (recommended)

A custom binary format generated by `scripts/generate_test_waveform.py` and the ingest pipeline. Fully self-describing — no sidecar needed.

```
Offset  Size  Type      Field
0       4     bytes     Magic: "WAVE"
4       1     uint8     Version: 1
5       32    bytes     source_id (null-padded UTF-8)
37      8     int64     timestamp_ms (big-endian)
45      4     float32   sample_rate in Hz (big-endian)
49      16    bytes     units (null-padded UTF-8, e.g. "V")
65      4     uint32    num_samples (big-endian)
69+     4×n   float32[] samples (big-endian, one per sample)
```

### Raw uint8

Raw ADC byte stream — one byte per sample, values 0–255. Requires a `.meta.json` sidecar file in the same directory with the same base name:

**`capture_001.bin.meta.json`:**
```json
{
  "format": "raw_uint8",
  "sample_rate": 1000.0,
  "source_id": "sourceA",
  "units": "ADC counts"
}
```

The system automatically detects which format to use: if a `.meta.json` sidecar exists it uses the raw uint8 parser; otherwise it expects WAVE v1.

> **Important:** Do not place a `.meta.json` sidecar alongside a WAVE v1 file — the system will try to parse it as raw uint8, producing garbage metrics.

---

## 10. End-to-End Example

This walks through a complete workflow: generate test data, load it, compare captures, and produce a report.

### Step 1 — Generate test waveforms

```bash
cd project1
python3 scripts/generate_test_waveform.py --generate-default-set
```

This creates WAVE v1 files in `data/raw/sourceA/` (three 10 Hz sine captures with increasing noise) and `data/raw/sourceB/` (two 50 Hz sine captures).

### Step 2 — Start the service

```bash
./run_bbb.sh
# Open http://localhost:8000
```

### Step 3 — Inspect a single capture

1. Click **sourceA** in the sidebar.
2. Click **capture_001.bin**.
3. View the Waveform tab — you should see a clean 10 Hz sine wave.
4. Check the metrics tiles:
   - **Dom. Freq** should read `10.00 Hz`
   - **SNR** should be > 20 dB (low-noise capture)
   - **Damping Rate** should be near 0 (steady-state sine)
5. Click the **FFT Spectrum** tab — a single spike at 10 Hz confirms the dominant frequency.

### Step 4 — Compare two captures

1. Click the **Compare** tab.
2. Slot A: `sourceA` → `capture_001.bin`
3. Slot B: `sourceA` → `capture_003.bin` (lower amplitude, more noise)
4. Click **Run Comparison**.
5. In the Pairwise Metrics table:
   - **Correlation** will be slightly below 1.0 (noise introduces differences)
   - **Phase Shift** will show `0.00°` (same frequency, no systematic delay)
6. Degradation indicators will flag the amplitude drop between captures 1 and 3.

### Step 5 — Compare across sources

1. Slot A: `sourceA` → `capture_001.bin` (10 Hz)
2. Slot B: `sourceB` → `capture_001.bin` (50 Hz)
3. **Phase Shift** will show **N/A** — the signals are at different frequencies so a phase angle is meaningless.
4. **RMSE** and **Correlation** will reflect the structural difference between the two waveforms.

### Step 6 — Generate a report

1. Note the comparison ID shown at the top of the Compare results (e.g. `cmp_1777300885146`).
2. Click the **Reports** tab.
3. Select `sourceA` as source and paste the comparison ID.
4. Click **Generate**. Open the report — it will include:
   - Signal health summary (SNR status, frequency stability, amplitude stability)
   - Per-capture metrics table for all three sourceA files
   - Trend analysis (capture_001 vs capture_003 deltas)
   - Comparison section with RMSE, correlation, phase shift, and degradation indicators
