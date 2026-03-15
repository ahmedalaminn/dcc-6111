# Waveform comparison logic — handles both same-source and cross-source comparisons.
# Signals are aligned via cross-correlation before any error metrics are computed.

import json
import os
import time

from app.core.analyzer import compare_signals, compute_metrics, detect_degradation

# How many points to send back for plotting — don't need full resolution for display
MAX_PLOT_POINTS = 1000


def _downsample(arr, max_points=MAX_PLOT_POINTS):
    if len(arr) > max_points:
        step = len(arr) // max_points
        return arr[::step].tolist()
    return arr.tolist()


def compare_waveforms(waveform_a, waveform_b, label_a=None, label_b=None):
    label_a = label_a or f"{waveform_a.source_id}/{waveform_a.filename}"
    label_b = label_b or f"{waveform_b.source_id}/{waveform_b.filename}"

    rmse, correlation, lag = compare_signals(waveform_a.samples, waveform_b.samples)

    metrics_a = compute_metrics(waveform_a.samples, waveform_a.sample_rate)
    # Pass A as the baseline for B so we get relative error metrics
    metrics_b = compute_metrics(waveform_b.samples, waveform_b.sample_rate, baseline=waveform_a.samples)

    # Build the difference signal using the lag-aligned arrays
    min_len = min(len(waveform_a.samples), len(waveform_b.samples))
    a = waveform_a.samples[:min_len]
    b = waveform_b.samples[:min_len]
    if lag > 0 and lag < min_len:
        a = a[lag:]
        b = b[:len(a)]
    elif lag < 0 and -lag < min_len:
        b = b[-lag:]
        a = a[:len(b)]
    diff_len = min(len(a), len(b))
    difference = a[:diff_len] - b[:diff_len]

    # Strip list-type entries (FFT arrays) from stored metrics — keep scalars only
    scalar_a = {k: v for k, v in metrics_a.items() if not isinstance(v, list)}
    scalar_b = {k: v for k, v in metrics_b.items() if not isinstance(v, list)}

    result = {
        "id": f"cmp_{int(time.time() * 1000)}",
        "timestamp_ms": int(time.time() * 1000),
        "label_a": label_a,
        "label_b": label_b,
        "source_a": waveform_a.source_id,
        "source_b": waveform_b.source_id,
        "filename_a": waveform_a.filename,
        "filename_b": waveform_b.filename,
        "rmse": rmse,
        "correlation": correlation,
        "alignment_lag_samples": lag,
        "metrics_a": scalar_a,
        "metrics_b": scalar_b,
        "degradation_indicators": detect_degradation(metrics_a, metrics_b),
        # Downsampled arrays for the frontend charts
        "waveform_a": _downsample(waveform_a.samples),
        "waveform_b": _downsample(waveform_b.samples),
        "difference": _downsample(difference),
        "fft_a": {"freqs": metrics_a.get("fft_freqs", []), "magnitudes": metrics_a.get("fft_magnitudes", [])},
        "fft_b": {"freqs": metrics_b.get("fft_freqs", []), "magnitudes": metrics_b.get("fft_magnitudes", [])},
    }

    return result


def save_comparison(result, comparisons_dir):
    os.makedirs(comparisons_dir, exist_ok=True)
    filepath = os.path.join(comparisons_dir, f"{result['id']}.json")

    # Don't save the large plot arrays to disk — they're only needed for the live response
    saveable = {k: v for k, v in result.items()
                if k not in ("waveform_a", "waveform_b", "difference", "fft_a", "fft_b")}

    with open(filepath, "w") as f:
        json.dump(saveable, f, indent=2)

    return filepath
