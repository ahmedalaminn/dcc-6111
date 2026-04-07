# Generates HTML engineering reports from stored metrics and comparison data.
# Uses Jinja2 to render report.html — nothing fancy, just fills in the template.

import csv
import json
import os
import time

from jinja2 import Environment, FileSystemLoader

from app.core.analyzer import compute_metrics
from app.ingest.parser import load_waveform

# Scalar fields for on-the-fly metric rows (same order as the CSV)
_METRIC_SCALAR_KEYS = [
    "filename", "timestamp_ms", "peak_to_peak", "max", "min", "rms",
    "mean", "std", "snr_db", "dominant_freq_hz", "dominant_freq_magnitude",
    "num_samples", "computed_at_ms",
]


def _compute_metrics_for_source(data_dir, source_id):
    """Compute metrics on the fly for every .bin file under data/raw/<source_id>/."""
    raw_dir = os.path.join(data_dir, "raw", source_id)
    if not os.path.isdir(raw_dir):
        return []

    rows = []
    for fname in sorted(os.listdir(raw_dir)):
        if not fname.endswith(".bin"):
            continue
        filepath = os.path.join(raw_dir, fname)
        try:
            wf = load_waveform(filepath)
            m = compute_metrics(wf.samples, wf.sample_rate)
            row = {k: m.get(k) for k in _METRIC_SCALAR_KEYS}
            row["filename"] = fname
            row["timestamp_ms"] = wf.timestamp_ms
            # Convert values to strings to match CSV reader output format
            rows.append({k: str(v) if v is not None else "" for k, v in row.items()})
        except Exception:
            continue
    return rows


def generate_report(data_dir, templates_dir, source_id=None, comparison_id=None):
    env = Environment(loader=FileSystemLoader(templates_dir), autoescape=True)
    template = env.get_template("report.html")

    report_data = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "source_id": source_id,
        "comparison_id": comparison_id,
        "metrics_history": [],
        "comparison": None,
    }

    # Pull metric history from the source's CSV if it exists,
    # otherwise compute metrics on the fly from the raw waveforms.
    if source_id:
        metrics_file = os.path.join(data_dir, "metrics", f"{source_id}_metrics.csv")
        if os.path.exists(metrics_file):
            with open(metrics_file, newline="") as f:
                report_data["metrics_history"] = list(csv.DictReader(f))
        else:
            report_data["metrics_history"] = _compute_metrics_for_source(data_dir, source_id)

    # Attach the comparison JSON if requested
    if comparison_id:
        cmp_file = os.path.join(data_dir, "comparisons", f"{comparison_id}.json")
        if os.path.exists(cmp_file):
            with open(cmp_file) as f:
                report_data["comparison"] = json.load(f)

    html = template.render(**report_data)

    reports_dir = os.path.join(data_dir, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    filepath = os.path.join(reports_dir, f"report_{int(time.time() * 1000)}.html")
    with open(filepath, "w") as f:
        f.write(html)

    return filepath
