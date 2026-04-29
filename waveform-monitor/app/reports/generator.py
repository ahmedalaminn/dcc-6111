# Generates HTML engineering reports from stored metrics and comparison data.
# Uses Jinja2 to render report.html — nothing fancy, just fills in the template.

import csv
import json
import os
import time

from jinja2 import Environment, FileSystemLoader

from app.core.analyzer import compute_metrics
from app.ingest.parser import load_waveform

_METRIC_SCALAR_KEYS = [
    "filename", "timestamp_ms", "peak_to_peak", "max", "min", "rms",
    "mean", "std", "snr_db", "dominant_freq_hz", "dominant_freq_magnitude",
    "damping_rate", "damping_time_constant_s", "num_samples", "computed_at_ms",
]


def _fmt_ts(ts_ms):
    if not ts_ms:
        return "—"
    try:
        return time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(int(float(ts_ms)) / 1000))
    except Exception:
        return "—"


def _fval(row, key):
    v = row.get(key)
    if v is None or v == "" or v == "None":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _normalize_row(row):
    """Coerce numeric fields to float so the template never has to do |float."""
    numeric = {
        "peak_to_peak", "max", "min", "rms", "mean", "std",
        "snr_db", "dominant_freq_hz", "dominant_freq_magnitude",
        "damping_rate", "damping_time_constant_s",
        "num_samples", "timestamp_ms", "computed_at_ms",
        "sample_rate", "duration_s",
    }
    out = {}
    for k, v in row.items():
        if k in numeric:
            out[k] = _fval(row, k)
        else:
            out[k] = v
    out["timestamp_str"] = _fmt_ts(row.get("timestamp_ms"))
    return out


def _build_summary(rows):
    """Compute health indicators and trend data from normalized metric rows."""
    if not rows:
        return {}

    snr_vals  = [r["snr_db"]           for r in rows if r.get("snr_db")           is not None]
    freq_vals = [r["dominant_freq_hz"] for r in rows if r.get("dominant_freq_hz") is not None and r["dominant_freq_hz"] > 0]
    rms_vals  = [r["rms"]              for r in rows if r.get("rms")              is not None]

    s = {"capture_count": len(rows)}

    if snr_vals:
        s["snr_min"] = round(min(snr_vals), 2)
        s["snr_max"] = round(max(snr_vals), 2)
        s["snr_health"] = "good" if min(snr_vals) > 10 else ("warn" if min(snr_vals) > 0 else "bad")

    if len(freq_vals) >= 2:
        ref = freq_vals[0]
        if ref > 0:
            max_dev_pct = max(abs(f - ref) / ref * 100 for f in freq_vals)
            s["freq_max_dev_pct"] = round(max_dev_pct, 2)
            s["freq_health"] = "good" if max_dev_pct < 2 else ("warn" if max_dev_pct < 10 else "bad")
    elif len(freq_vals) == 1:
        s["freq_max_dev_pct"] = 0.0
        s["freq_health"] = "good"

    if len(rms_vals) >= 2:
        rms_mean = sum(rms_vals) / len(rms_vals)
        if rms_mean > 0:
            rms_var_pct = (max(rms_vals) - min(rms_vals)) / rms_mean * 100
            s["rms_var_pct"] = round(rms_var_pct, 2)
            s["amp_health"] = "good" if rms_var_pct < 5 else ("warn" if rms_var_pct < 20 else "bad")

    # First-vs-last trend
    if len(rows) >= 2:
        first, last = rows[0], rows[-1]
        s["first_filename"] = first.get("filename", "")
        s["last_filename"]  = last.get("filename", "")
        for key in ("rms", "snr_db", "dominant_freq_hz", "peak_to_peak", "damping_rate"):
            v0, v1 = first.get(key), last.get(key)
            if v0 is not None and v1 is not None and v0 != 0:
                delta = v1 - v0
                s[f"{key}_delta"] = round(delta, 6)
                s[f"{key}_delta_pct"] = round(delta / abs(v0) * 100, 2)

    healths = [v for k, v in s.items() if k.endswith("_health")]
    if "bad" in healths:
        s["overall_health"] = "bad"
    elif "warn" in healths:
        s["overall_health"] = "warn"
    elif healths:
        s["overall_health"] = "good"

    return s


def _compute_metrics_for_source(data_dir, source_id):
    raw_dir = os.path.join(data_dir, "raw", source_id)
    if not os.path.isdir(raw_dir):
        return []

    rows = []
    for fname in sorted(os.listdir(raw_dir)):
        if not fname.endswith(".bin"):
            continue
        try:
            wf = load_waveform(os.path.join(raw_dir, fname))
            m  = compute_metrics(wf.samples, wf.sample_rate)
            row = {k: m.get(k) for k in _METRIC_SCALAR_KEYS}
            row["filename"]     = fname
            row["timestamp_ms"] = wf.timestamp_ms
            row["sample_rate"]  = wf.sample_rate
            row["duration_s"]   = wf.duration_s
            rows.append(_normalize_row(row))
        except Exception:
            continue
    return rows


def generate_report(data_dir, templates_dir, source_id=None, comparison_id=None):
    env = Environment(loader=FileSystemLoader(templates_dir), autoescape=True)
    template = env.get_template("report.html")

    metrics_history = []
    if source_id:
        metrics_file = os.path.join(data_dir, "metrics", f"{source_id}_metrics.csv")
        if os.path.exists(metrics_file):
            with open(metrics_file, newline="") as f:
                metrics_history = [_normalize_row(r) for r in csv.DictReader(f)]
        else:
            metrics_history = _compute_metrics_for_source(data_dir, source_id)

    comparison = None
    if comparison_id:
        cmp_file = os.path.join(data_dir, "comparisons", f"{comparison_id}.json")
        if os.path.exists(cmp_file):
            with open(cmp_file) as f:
                comparison = json.load(f)

    report_data = {
        "generated_at":   time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "source_id":      source_id,
        "comparison_id":  comparison_id,
        "metrics_history": metrics_history,
        "summary":        _build_summary(metrics_history),
        "comparison":     comparison,
    }

    html = template.render(**report_data)

    reports_dir = os.path.join(data_dir, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    filepath = os.path.join(reports_dir, f"report_{int(time.time() * 1000)}.html")
    with open(filepath, "w") as f:
        f.write(html)

    return filepath
