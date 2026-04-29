# Release Notes — Waveform Monitor and Comparator

## Version 1.0 — Initial Release

**Release Date:** April 2026
**Platform:** Linux (primary target: BeagleBone Black ARMv7; also runs on x86-64 Linux / macOS)

---

## New Features

This is the first release. The following primary features were developed by the team:

### Binary Waveform Ingestion
- Parses **WAVE v1** custom binary format: big-endian float32 samples with a 69-byte header carrying source ID, timestamp, sample rate, and units.
- Parses **Raw uint8** ADC byte streams with a companion `.meta.json` sidecar file that supplies the missing metadata.
- All samples are stored internally as **float32** arrays (≈50% memory reduction versus float64), keeping heap usage low on the 512 MB BeagleBone Black.

### Signal Metrics Engine
Computes eight scalar metrics per capture:
| Metric | Method |
|---|---|
| Peak-to-Peak | max − min |
| RMS | root mean square |
| Mean | arithmetic mean (DC level) |
| Std Dev | standard deviation |
| SNR (dB) | signal-to-noise ratio via 5-sample moving-average residual |
| Dominant Frequency (Hz) | FFT peak bin (DC excluded), computed on up to 131,072 samples via NumPy `rfft` |
| Damping Rate (s⁻¹) | exponential decay rate estimated from amplitude envelope peaks |
| Time Constant (s) | 1 / damping rate — time for amplitude to decay to ~37% |

Metrics are appended to a per-source CSV file for long-term trend tracking.

### Multi-Waveform Comparison (up to 5 signals)
- Automatically time-aligns signals via **FFT-based cross-correlation** before computing error metrics.
- Cross-correlation is computed once and reused for all downstream metrics (RMSE, Pearson correlation, alignment lag, phase shift).
- **Phase shift (°)** is computed from the lag when both signals share a dominant frequency within 10%; otherwise reported as N/A.
- **Degradation detection** flags: amplitude change >20%, SNR drop >3 dB, frequency shift >10%, damping rate change >1 s⁻¹, RMSE >30% of reference RMS.
- Comparison results are saved as compact JSON files for later retrieval.

### Web-Based Visualization Interface
Built with Flask + vanilla JS (Chart.js served locally); no external CDN dependencies.
- **Waveform tab** — time-domain plot with correct time axis derived from sample rate.
- **FFT Spectrum tab** — server-computed frequency spectrum (512 display bins); no browser-side DFT.
- **Metrics Trend tab** — key metrics plotted across all captures for a source.
- **Compare tab** — up to 5 waveforms overlaid; per-pair RMSE, correlation, lag, and phase shift table; difference plot.
- **Ingest tab** — drag-and-drop or file-picker binary upload.
- **Reports tab** — generate and download self-contained HTML engineering reports.

### Command-Line Interface (CLI)
Supports `ingest`, `analyze`, `compare`, `monitor`, and `report` subcommands for automation and scripting workflows.

### Self-Contained Engineering Reports
- Generated as standalone HTML files — no JavaScript, no external dependencies.
- Sections: Signal Health Summary (color-coded tiles), Per-Capture Metrics Table, Trend Analysis (first-vs-last delta), Comparison Summary, Side-by-Side Metrics with delta column, Degradation Indicators.
- Renders correctly as a local file and prints cleanly to PDF.

### BeagleBone Black Optimizations
- `float32` pipeline throughout (parser → analyzer → comparator).
- Sample caps and FFT limits configurable via environment variables (`MAX_SAMPLES`, `MAX_FFT_SAMPLES`, `MAX_ALIGNMENT_SAMPLES`, `MAX_COMPARE_SAMPLES`).
- No SciPy dependency — only Flask, NumPy, and Jinja2.
- One-shot setup script (`scripts/setup_bbb.sh`) installs system packages via `apt` and creates an isolated virtual environment.

---

## Bug Fixes

The following bugs were identified and resolved during development:

| # | Bug | Root Cause | Fix |
|---|---|---|---|
| 1 | **PTP always 255, mean always 0** for all waveforms regardless of signal content | Stale `.meta.json` sidecar files present alongside WAVE v1 `.bin` files caused the parser to route float32 binary data through the raw uint8 parser. Reading float32 bytes as uint8 always produces values spanning 0–255. | Deleted the five stale sidecar files so WAVE v1 files are correctly dispatched to the WAVE v1 parser. |
| 2 | **FFT frequency axis showing incorrect values** in the web UI spectrum chart | The browser-side chart used `sample_rate` (the original ingestion rate) as the Nyquist reference when the data had already been downsampled server-side. | Changed the chart to use `display_sample_rate`, which the API already returns alongside the downsampled FFT bins. |
| 3 | **O(n²) browser-side DFT** causing the FFT tab to freeze on waveforms longer than a few seconds | The frontend was computing the DFT in JavaScript using a naive nested loop over all samples. | Replaced with server-computed NumPy `rfft` on up to 131,072 samples, downsampled to 512 bins before sending to the browser. |
| 4 | **Duplicate cross-correlation** in the comparator doubling CPU time on comparison requests | `compute_metrics()` internally called `compare_signals()` when a baseline was supplied, and the caller was also running `compare_signals()` independently. | Eliminated the redundant call by injecting the already-computed RMSE, correlation, and lag directly into the metrics dict rather than re-running the comparison. |

---

## Known Bugs and Defects

| # | Issue | Impact | Workaround |
|---|---|---|---|
| 1 | **Phase shift reported as N/A when signal frequencies differ by >10%** | Expected by design, but may surprise users comparing different signal types. Phase shift is mathematically undefined between different frequencies. | Use signals from the same source or signals with matched dominant frequencies. The Metrics tab shows each signal's dominant frequency before comparing. |
| 2 | **Metrics Trend chart requires at least two captures** to display a meaningful plot | Single-capture sources show an empty trend chart. | Ingest a second capture for the source. Use `scripts/generate_test_waveform.py` to generate additional synthetic captures. |
| 3 | **`waveform-cli monitor` directory watcher** uses polling rather than `inotify`, increasing CPU load on high-frequency directories | Minimal impact at typical lab capture rates (< 1 file/second). | Limit monitored directories to low-frequency capture paths. |
| 4 | **Reports do not auto-refresh** when new captures are ingested after a report is generated | The report is a static HTML snapshot. | Re-generate the report from the Reports tab after new captures are ingested. |
| 5 | **Damping rate returns N/A for signals with fewer than 3 amplitude peaks above 20% of maximum** | Steady-state sinusoids with no visible decay will show N/A for damping rate and time constant; this is correct behavior, not an error. | N/A for these fields is the expected and correct output for non-decaying signals. |
