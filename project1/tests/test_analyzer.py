"""Tests for signal analysis and comparison."""

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.analyzer import compare_signals, compute_metrics, detect_degradation


def sine_wave(freq=10.0, sample_rate=1000.0, duration=1.0, amplitude=1.0):
    t = np.linspace(0, duration, int(sample_rate * duration))
    return np.sin(2 * np.pi * freq * t) * amplitude


# ---------------------------------------------------------------------------
# compute_metrics
# ---------------------------------------------------------------------------

def test_peak_to_peak():
    samples = np.array([-1.0, 0.0, 1.0, 0.5, -0.5])
    m = compute_metrics(samples, sample_rate=100.0)
    assert m["peak_to_peak"] == pytest.approx(2.0)


def test_rms_sine():
    s = sine_wave(freq=10, sample_rate=1000, duration=1.0, amplitude=1.0)
    m = compute_metrics(s, sample_rate=1000.0)
    # RMS of a unit sine ≈ 1/sqrt(2) ≈ 0.7071
    assert m["rms"] == pytest.approx(1.0 / np.sqrt(2), abs=0.01)


def test_dominant_freq():
    s = sine_wave(freq=50.0, sample_rate=1000.0)
    m = compute_metrics(s, sample_rate=1000.0)
    assert m["dominant_freq_hz"] == pytest.approx(50.0, abs=2.0)


def test_snr_not_none():
    s = sine_wave() + np.random.default_rng(42).normal(0, 0.01, 1000)
    m = compute_metrics(s, sample_rate=1000.0)
    assert m["snr_db"] is not None
    assert m["snr_db"] > 0


def test_fft_arrays_present():
    s = sine_wave()
    m = compute_metrics(s, sample_rate=1000.0)
    assert "fft_freqs" in m
    assert "fft_magnitudes" in m
    assert len(m["fft_freqs"]) == len(m["fft_magnitudes"])


def test_baseline_metrics():
    a = sine_wave(freq=10)
    b = a.copy()
    m = compute_metrics(a, sample_rate=1000.0, baseline=b)
    assert m["rmse_vs_baseline"] == pytest.approx(0.0, abs=1e-6)
    assert m["correlation_vs_baseline"] == pytest.approx(1.0, abs=1e-6)


# ---------------------------------------------------------------------------
# compare_signals
# ---------------------------------------------------------------------------

def test_identical_signals():
    s = sine_wave()
    rmse, corr, lag = compare_signals(s, s)
    assert rmse == pytest.approx(0.0, abs=1e-6)
    assert corr == pytest.approx(1.0, abs=1e-4)


def test_inverted_signal_correlation():
    s = sine_wave()
    rmse, corr, lag = compare_signals(s, -s)
    assert corr == pytest.approx(-1.0, abs=0.01)


def test_different_length_signals():
    a = sine_wave(duration=1.0)
    b = sine_wave(duration=0.5)
    rmse, corr, lag = compare_signals(a, b)
    assert isinstance(rmse, float)
    assert isinstance(corr, float)


def test_noisy_signal_rmse():
    s = sine_wave()
    noisy = s + np.random.default_rng(0).normal(0, 0.1, len(s))
    rmse, corr, _ = compare_signals(s, noisy)
    assert 0 < rmse < 0.5


# ---------------------------------------------------------------------------
# detect_degradation
# ---------------------------------------------------------------------------

def test_no_degradation():
    s = sine_wave()
    m = compute_metrics(s, sample_rate=1000.0)
    indicators = detect_degradation(m, m)
    assert indicators == []


def test_amplitude_degradation():
    ref = compute_metrics(sine_wave(amplitude=1.0), sample_rate=1000.0)
    new = compute_metrics(sine_wave(amplitude=0.5), sample_rate=1000.0)
    indicators = detect_degradation(ref, new)
    assert any("peak-to-peak" in i.lower() or "amplitude" in i.lower() for i in indicators)
