#!/usr/bin/env python3
"""Small BBB-oriented smoke test for waveform analysis memory usage."""

import os
import resource
import sys

import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from app.core.analyzer import compare_signals, compute_metrics
from app.config import MAX_SAMPLES
from app.ingest.parser import load_waveform


def max_rss_mb():
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Linux reports kilobytes, macOS reports bytes.
    if sys.platform == "darwin":
        return rss / (1024 * 1024)
    return rss / 1024


def main():
    waveform_path = os.path.join(PROJECT_ROOT, "data", "raw", "sourceA", "capture_001.bin")

    wf = load_waveform(waveform_path)
    metrics = compute_metrics(wf.samples, wf.sample_rate, baseline=wf.samples)
    rmse, corr, lag = compare_signals(wf.samples, wf.samples)

    print(f"waveform={os.path.relpath(waveform_path, PROJECT_ROOT)}")
    print(f"samples={wf.num_samples}")
    print(f"dominant_freq_hz={metrics['dominant_freq_hz']:.2f}")
    print(f"rmse={rmse:.6f}")
    print(f"corr={corr:.6f}")
    print(f"lag={lag}")

    # Stress the configured upper bound so we can approximate the worst-case
    # memory footprint without shipping huge demo files to the BBB.
    stress_sample_rate = 1000.0
    t = np.arange(MAX_SAMPLES) / stress_sample_rate
    stress_signal = np.sin(2 * np.pi * 17.0 * t)
    stress_metrics = compute_metrics(stress_signal, stress_sample_rate, baseline=stress_signal)
    stress_rmse, stress_corr, stress_lag = compare_signals(stress_signal, stress_signal)

    print(f"stress_samples={MAX_SAMPLES}")
    print(f"stress_dominant_freq_hz={stress_metrics['dominant_freq_hz']:.2f}")
    print(f"stress_rmse={stress_rmse:.6f}")
    print(f"stress_corr={stress_corr:.6f}")
    print(f"stress_lag={stress_lag}")
    print(f"max_rss_mb={max_rss_mb():.2f}")


if __name__ == "__main__":
    main()
