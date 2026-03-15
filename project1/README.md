# Waveform Monitor and Comparator

## Overview

The **Waveform Monitor and Comparator** is a lightweight Linux microservice designed to ingest, analyze, and compare waveform data over time. The system processes waveform captures provided in **binary format**, computes signal statistics, tracks signal behavior across time, and detects potential degradation or expected changes in waveform characteristics.

The application supports both **command-line workflows** and a **web-based visualization interface**, allowing engineers to inspect waveform behavior, compare signals across sources, and generate engineering reports.

The system is designed to run in constrained Linux environments similar to embedded platforms (for example, BeagleBone Black). Because of this, the implementation prioritizes:

- minimal dependencies
- low memory usage
- lightweight storage mechanisms
- efficient signal processing

---

# Features

## Binary Waveform Ingestion

Waveforms are provided in **binary format** and are parsed by the system before analysis. The ingestion layer converts raw binary waveform files into a normalized internal representation that can be processed by the signal analysis engine.

This design separates **binary decoding** from downstream signal analysis, allowing the rest of the system to remain independent of the specific waveform format.

Once parsed, waveform data is processed as numeric sample arrays with associated metadata such as:

- source identifier
- capture timestamp
- sample rate
- signal units

The original binary files are preserved for traceability.

## Waveform Monitoring

Each new waveform capture is analyzed to compute key signal statistics.

These include:

- Peak-to-peak amplitude
- RMS value
- Signal-to-noise ratio (SNR)
- Frequency characteristics using FFT
- Correlation with reference waveforms
- Error metrics between signals

Computed metrics are stored with timestamps to allow the system to track waveform behavior across time.

## Signal Comparison

The system supports two primary comparison modes.

### Per-Source Monitoring

New waveform captures can be compared against:

- the most recent waveform from the same source
- a baseline or reference waveform
- historical waveform statistics

This allows engineers to track long-term signal drift or degradation.

### Cross-Source Comparison

Waveforms from different sources can also be compared to identify:

- channel divergence
- unexpected signal differences
- configuration changes between systems

Before comparison, signals are automatically **aligned using cross-correlation** to ensure meaningful comparisons.

## Visualization

A web interface allows engineers to explore waveform data interactively.

Users can:

- select waveform sources
- visualize waveform overlays
- inspect FFT spectra
- view signal difference plots
- analyze metric trends across time

These visualizations help engineers diagnose signal issues and validate system behavior.

## CLI Support

A command-line interface enables automation and scripting workflows.

Common CLI operations include:

- ingesting binary waveform files
- computing signal metrics
- comparing waveform captures
- generating engineering reports
- monitoring directories for new waveform data

This allows the system to integrate easily into automated test pipelines or engineering workflows.

## Automated Reporting

The system can generate **engineering review reports** summarizing waveform comparisons and signal metrics.

Reports include:

- waveform overlays
- signal difference plots
- FFT spectrum comparisons
- summary metric tables
- degradation indicators

Reports are generated in **HTML format** and can be archived or shared for engineering analysis.

## Embedded Target Profiling

Since the application is intended to run on embedded-class Linux systems, the project includes profiling to measure:

- runtime performance
- memory usage
- dependency footprint
- storage requirements

These measurements help demonstrate that the system can operate on resource-constrained devices similar to a **BeagleBone Black**.

---

# System Architecture

```text
Binary Waveform Input
        │
        ▼
Binary Parser / Decoder
        │
        ▼
Normalized Waveform Representation
        │
        ▼
Signal Processing Engine
        │
        ├── Metric Computation
        ├── Signal Alignment
        ├── FFT Analysis
        └── Degradation Detection
        │
        ▼
File-Based Storage
        │
        ├── CLI Interface
        └── Web API
               │
               ▼
             Web UI
```

The architecture separates waveform decoding from signal analysis so that the processing pipeline remains independent of the binary input format.

---

# Project Structure

```text
waveform-monitor/
│
├── app/
│   ├── api/          # REST endpoints
│   ├── cli/          # Command line interface
│   ├── ingest/       # binary waveform parsing
│   ├── core/         # signal processing and comparison logic
│   ├── reports/      # report generation
│   ├── templates/    # HTML templates for UI and reports
│   ├── static/       # frontend assets
│   └── main.py
│
├── data/
│   ├── raw/          # original binary waveform files
│   ├── metrics/      # computed waveform metrics
│   ├── comparisons/  # waveform comparison results
│   └── reports/      # generated reports
│
├── tests/            # unit and integration tests
├── scripts/          # utility scripts
│
├── requirements.txt
├── README.md
└── Dockerfile
```

---

# Installation

## Requirements

- Linux or WSL
- Python 3.10+
- pip

## Setup

Clone the repository:

```bash
git clone https://github.com/ahmedalaminn/dcc-6111.git
cd waveform-monitor
```

Create a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

# Running the Service

Start the microservice:

```bash
python app/main.py
```

Once started, the web interface will be available at:

```text
http://localhost:8000
```

---

# CLI Usage

### Ingest a binary waveform

```bash
waveform-cli ingest data/raw/sourceA/capture_001.bin
```

### Analyze waveform statistics

```bash
waveform-cli analyze --input capture_001.bin
```

### Compare two waveforms

```bash
waveform-cli compare --a capture_001.bin --b baseline.bin
```

### Monitor a directory for new waveform files

```bash
waveform-cli monitor --dir ./incoming
```

### Generate a report

```bash
waveform-cli report --source sourceA --output report.html
```

---

# Signal Metrics

The system computes the following metrics for each waveform.

| Metric | Description |
|------|------|
| Peak-to-Peak | Difference between maximum and minimum signal values |
| RMS | Root mean square signal amplitude |
| SNR | Signal-to-noise ratio relative to baseline |
| FFT Spectrum | Frequency-domain representation of the waveform |
| Correlation | Similarity between two signals |
| RMSE | Error between compared waveforms |

These metrics support both **time-domain** and **frequency-domain** signal analysis.

---

# Data Storage

The system uses **lightweight file-based persistence** rather than a database in order to reduce deployment complexity and minimize resource usage.

Waveform data and analysis outputs are organized using a directory structure.

```text
data/
├── raw/
│   ├── sourceA/
│   └── sourceB/
├── metrics/
│   ├── sourceA_metrics.csv
│   └── sourceB_metrics.csv
├── comparisons/
│   └── comparison_*.json
└── reports/
```

This approach makes the system easier to deploy on embedded Linux environments.

---

# Degradation Detection

Signal degradation is detected by comparing waveform metrics against baseline or historical signals.

Example indicators include:

- large changes in peak-to-peak amplitude
- reduced SNR
- shifts in dominant frequency
- increased error relative to baseline
- reduced correlation with reference waveform

Thresholds can be configured per waveform source.

---

# Deployment Target

The application is designed to run on **embedded Linux systems**, including:

- BeagleBone Black
- Raspberry Pi class devices
- industrial embedded Linux controllers

The system uses:

- lightweight Python services
- file-based persistence
- minimal external dependencies

This helps keep both runtime overhead and deployment complexity low.

---

# Profiling and Performance

The system includes profiling tools to evaluate:

- waveform ingestion latency
- metric computation runtime
- report generation time
- peak memory usage
- dependency footprint

These measurements help ensure the service can operate on resource-constrained hardware environments.

---

# Future Improvements

Potential future enhancements include:

- automated anomaly detection
- adaptive signal thresholds
- streaming waveform ingestion
- multi-source synchronization
- advanced spectral analysis
- integration with monitoring dashboards

---

# License

This project is provided for academic and research purposes as part of a Georgia Tech capstone project.