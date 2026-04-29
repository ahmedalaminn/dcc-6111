# Waveform comparison logic — handles both same-source and cross-source comparisons.
# Signals are aligned via cross-correlation before any error metrics are computed.

import json
import os
import time

import numpy as np

from app.core.analyzer import compare_signals, compute_metrics, detect_degradation

# How many points to send back for plotting — don't need full resolution for display
MAX_PLOT_POINTS = 1000


def _phase_shift_deg(lag, sample_rate, freq_a, freq_b):
    """Convert cross-correlation lag to phase shift in degrees.

    Only meaningful when both signals share the same dominant frequency (within
    10 %). Returns None when frequencies differ too much or are too low to give
    a reliable result.
    """
    if not freq_a or not freq_b:
        return None
    if abs(freq_a - freq_b) / max(freq_a, freq_b) > 0.10:
        return None
    freq = (freq_a + freq_b) / 2.0
    if freq < 0.5:
        return None
    phase = (lag / sample_rate) * freq * 360.0
    # Normalise to (-180, 180]
    phase = ((phase + 180.0) % 360.0) - 180.0
    return float(phase)


def _downsample(arr, max_points=MAX_PLOT_POINTS):
    if len(arr) > max_points:
        idx = np.linspace(0, len(arr) - 1, max_points, dtype=int)
        return arr[idx].tolist()
    return arr.tolist()


def compare_waveforms(waveform_a, waveform_b, label_a=None, label_b=None,
                      display_a=None, display_b=None):
    label_a = label_a or f"{waveform_a.source_id}/{waveform_a.filename}"
    label_b = label_b or f"{waveform_b.source_id}/{waveform_b.filename}"

    # Metrics and cross-correlation use the (possibly capped) samples
    rmse, correlation, lag = compare_signals(waveform_a.samples, waveform_b.samples)

    metrics_a = compute_metrics(waveform_a.samples, waveform_a.sample_rate)
    metrics_b = compute_metrics(waveform_b.samples, waveform_b.sample_rate)
    # Reuse already-computed cross-correlation results instead of running compare_signals again
    metrics_b["rmse_vs_baseline"] = rmse
    metrics_b["correlation_vs_baseline"] = correlation
    metrics_b["alignment_lag_samples"] = lag

    phase_shift_deg = _phase_shift_deg(lag, waveform_a.sample_rate,
                                       metrics_a.get("dominant_freq_hz", 0),
                                       metrics_b.get("dominant_freq_hz", 0))

    # Build the aligned difference signal (used for metrics/diff chart only)
    min_len = min(len(waveform_a.samples), len(waveform_b.samples))
    a_aligned = waveform_a.samples[:min_len]
    b_aligned = waveform_b.samples[:min_len]
    if lag > 0 and lag < min_len:
        a_aligned = a_aligned[lag:]
        b_aligned = b_aligned[:len(a_aligned)]
    elif lag < 0 and -lag < min_len:
        b_aligned = b_aligned[-lag:]
        a_aligned = a_aligned[:len(b_aligned)]
    diff_len = min(len(a_aligned), len(b_aligned))
    difference = a_aligned[:diff_len] - b_aligned[:diff_len]

    # Use full samples for display if provided, otherwise fall back to the capped samples
    plot_a = display_a if display_a is not None else waveform_a.samples
    plot_b = display_b if display_b is not None else waveform_b.samples

    # Strip list-type entries (FFT arrays) from stored metrics — keep scalars only
    scalar_a = {k: v for k, v in metrics_a.items() if not isinstance(v, list)}
    scalar_b = {k: v for k, v in metrics_b.items() if not isinstance(v, list)}

    ts_ms = int(time.time() * 1000)
    result = {
        "id": f"cmp_{ts_ms}",
        "timestamp_ms": ts_ms,
        "label_a": label_a,
        "label_b": label_b,
        "source_a": waveform_a.source_id,
        "source_b": waveform_b.source_id,
        "filename_a": waveform_a.filename,
        "filename_b": waveform_b.filename,
        "rmse": rmse,
        "correlation": correlation,
        "alignment_lag_samples": lag,
        "phase_shift_deg": phase_shift_deg,
        "metrics_a": scalar_a,
        "metrics_b": scalar_b,
        "degradation_indicators": detect_degradation(metrics_a, metrics_b),
        # Full-length downsampled arrays for display — onset alignment handled by frontend
        "waveform_a": _downsample(plot_a),
        "waveform_b": _downsample(plot_b),
        "difference": _downsample(difference),
        "fft_a": {"freqs": metrics_a.get("fft_freqs", []), "magnitudes": metrics_a.get("fft_magnitudes", [])},
        "fft_b": {"freqs": metrics_b.get("fft_freqs", []), "magnitudes": metrics_b.get("fft_magnitudes", [])},
    }

    return result


def compare_waveforms_multi(waveforms, display_samples=None):
    """Compare N waveforms (2–5), computing metrics for every pair."""
    n = len(waveforms)
    if n < 2 or n > 5:
        raise ValueError("Need 2–5 waveforms to compare")

    labels = [f"{wf.source_id}/{wf.filename}" for wf in waveforms]

    if display_samples is None:
        display_samples = [wf.samples for wf in waveforms]
    waveform_arrays = [_downsample(ds) for ds in display_samples]

    fft_data = []
    metrics_list = []
    for wf in waveforms:
        m = compute_metrics(wf.samples, wf.sample_rate)
        fft_data.append({
            "freqs": m.get("fft_freqs", []),
            "magnitudes": m.get("fft_magnitudes", []),
        })
        metrics_list.append(m)

    pairs = []
    for i in range(n):
        for j in range(i + 1, n):
            rmse, correlation, lag = compare_signals(waveforms[i].samples, waveforms[j].samples)

            min_len = min(len(waveforms[i].samples), len(waveforms[j].samples))
            a_aligned = waveforms[i].samples[:min_len]
            b_aligned = waveforms[j].samples[:min_len]
            if lag > 0 and lag < min_len:
                a_aligned = a_aligned[lag:]
                b_aligned = b_aligned[:len(a_aligned)]
            elif lag < 0 and -lag < min_len:
                b_aligned = b_aligned[-lag:]
                a_aligned = a_aligned[:len(b_aligned)]
            diff_len = min(len(a_aligned), len(b_aligned))
            difference = a_aligned[:diff_len] - b_aligned[:diff_len]

            ps = _phase_shift_deg(lag, waveforms[i].sample_rate,
                                   metrics_list[i].get("dominant_freq_hz", 0),
                                   metrics_list[j].get("dominant_freq_hz", 0))
            pairs.append({
                "i": i,
                "j": j,
                "label_i": labels[i],
                "label_j": labels[j],
                "rmse": rmse,
                "correlation": correlation,
                "alignment_lag_samples": lag,
                "phase_shift_deg": ps,
                "difference": _downsample(difference),
                "degradation_indicators": detect_degradation(metrics_list[i], metrics_list[j]),
            })

    return {
        "id": f"cmp_{int(time.time() * 1000)}",
        "timestamp_ms": int(time.time() * 1000),
        "labels": labels,
        "waveform_arrays": waveform_arrays,
        "fft_data": fft_data,
        "pairs": pairs,
    }


def save_comparison(result, comparisons_dir):
    os.makedirs(comparisons_dir, exist_ok=True)
    filepath = os.path.join(comparisons_dir, f"{result['id']}.json")

    # Strip large plot arrays — they're only needed for the live response
    PLOT_KEYS = {"waveform_a", "waveform_b", "difference", "fft_a", "fft_b",
                 "waveform_arrays", "fft_data"}
    saveable = {}
    for k, v in result.items():
        if k in PLOT_KEYS:
            continue
        if k == "pairs":
            saveable["pairs"] = [{pk: pv for pk, pv in p.items() if pk != "difference"} for p in v]
        else:
            saveable[k] = v

    with open(filepath, "w") as f:
        json.dump(saveable, f, separators=(",", ":"))

    return filepath
