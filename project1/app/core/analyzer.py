# Signal analysis — computes the metrics we care about for each waveform capture.
# All functions take raw numpy arrays so they stay independent of the file format.

import time

import numpy as np
from scipy import signal as scipy_signal

# Cap FFT output at 512 bins — enough frequency resolution for display without bloating responses
MAX_FFT_POINTS = 512


def compute_metrics(samples, sample_rate, baseline=None):
    metrics = {}

    # Basic time-domain stats
    metrics["peak_to_peak"] = float(np.max(samples) - np.min(samples))
    metrics["max"] = float(np.max(samples))
    metrics["min"] = float(np.min(samples))
    metrics["rms"] = float(np.sqrt(np.mean(samples ** 2)))
    metrics["mean"] = float(np.mean(samples))
    metrics["std"] = float(np.std(samples))
    metrics["num_samples"] = int(len(samples))

    # SNR estimate: smooth the signal with a 5-sample moving average to get the
    # "clean" component, then treat the residual as noise.
    if len(samples) >= 5:
        smoothed = np.convolve(samples, np.ones(5) / 5, mode="same")
        noise = samples - smoothed
        signal_power = float(np.mean(smoothed ** 2))
        noise_power = float(np.mean(noise ** 2))
        if noise_power > 0 and signal_power > 0:
            metrics["snr_db"] = float(10 * np.log10(signal_power / noise_power))
        else:
            metrics["snr_db"] = None
    else:
        metrics["snr_db"] = None

    # FFT — skip DC bin when looking for dominant frequency.
    # Cap input to avoid blowing RAM on the BBB; 200k samples gives ~1Hz resolution @ 200kHz SR.
    fft_samples = samples[:200_000] if len(samples) > 200_000 else samples
    n = len(fft_samples)
    fft_vals = np.fft.rfft(fft_samples)
    freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate)
    magnitudes = np.abs(fft_vals) * 2.0 / n

    if len(magnitudes) > 1:
        dominant_idx = int(np.argmax(magnitudes[1:])) + 1
        metrics["dominant_freq_hz"] = float(freqs[dominant_idx])
        metrics["dominant_freq_magnitude"] = float(magnitudes[dominant_idx])
    else:
        metrics["dominant_freq_hz"] = 0.0
        metrics["dominant_freq_magnitude"] = 0.0

    # Downsample FFT arrays so they don't blow up response payloads
    if len(freqs) > MAX_FFT_POINTS:
        step = len(freqs) // MAX_FFT_POINTS
        metrics["fft_freqs"] = freqs[::step].tolist()
        metrics["fft_magnitudes"] = magnitudes[::step].tolist()
    else:
        metrics["fft_freqs"] = freqs.tolist()
        metrics["fft_magnitudes"] = magnitudes.tolist()

    # Optional baseline comparison
    if baseline is not None:
        rmse, corr, lag = compare_signals(samples, baseline)
        metrics["rmse_vs_baseline"] = rmse
        metrics["correlation_vs_baseline"] = corr
        metrics["alignment_lag_samples"] = lag

    metrics["computed_at_ms"] = int(time.time() * 1000)
    return metrics


def compare_signals(signal_a, signal_b):
    # Trim both to the shorter length before comparing
    min_len = min(len(signal_a), len(signal_b))
    a = signal_a[:min_len].copy()
    b = signal_b[:min_len].copy()

    # Cross-correlation to find how many samples one signal leads the other.
    # We subtract the mean first so DC offset doesn't dominate the result.
    corr_full = scipy_signal.correlate(a - np.mean(a), b - np.mean(b), mode="full")
    lag = int(np.argmax(np.abs(corr_full))) - (min_len - 1)

    # Shift the signals so they line up before computing error metrics
    if lag > 0:
        a_aligned = a[lag:]
        b_aligned = b[:len(a_aligned)]
    elif lag < 0:
        b_aligned = b[-lag:]
        a_aligned = a[:len(b_aligned)]
    else:
        a_aligned, b_aligned = a, b

    align_len = min(len(a_aligned), len(b_aligned))
    a_aligned = a_aligned[:align_len]
    b_aligned = b_aligned[:align_len]

    rmse = float(np.sqrt(np.mean((a_aligned - b_aligned) ** 2)))

    # Pearson correlation — guard against flat signals to avoid divide-by-zero
    std_a = float(np.std(a_aligned))
    std_b = float(np.std(b_aligned))
    if std_a > 0 and std_b > 0:
        corr = float(np.corrcoef(a_aligned, b_aligned)[0, 1])
    else:
        corr = 1.0 if np.allclose(a_aligned, b_aligned) else 0.0

    return rmse, corr, lag


def detect_degradation(metrics_ref, metrics_new):
    # Flag anything that looks like a meaningful change from the reference signal.
    # Thresholds here are intentionally conservative — tweak as needed per signal type.
    indicators = []

    pp_ref = metrics_ref.get("peak_to_peak") or 0
    pp_new = metrics_new.get("peak_to_peak") or 0
    if pp_ref > 0 and abs(pp_new - pp_ref) / pp_ref > 0.2:
        pct = abs(pp_new - pp_ref) / pp_ref * 100
        indicators.append(f"Peak-to-peak amplitude changed by {pct:.1f}%")

    snr_ref = metrics_ref.get("snr_db")
    snr_new = metrics_new.get("snr_db")
    if snr_ref is not None and snr_new is not None and snr_new < snr_ref - 3:
        indicators.append(f"SNR dropped by {snr_ref - snr_new:.1f} dB")

    df_ref = metrics_ref.get("dominant_freq_hz") or 0
    df_new = metrics_new.get("dominant_freq_hz") or 0
    if df_ref > 0 and abs(df_new - df_ref) / df_ref > 0.1:
        indicators.append(f"Dominant frequency shifted from {df_ref:.1f} Hz to {df_new:.1f} Hz")

    rmse = metrics_new.get("rmse_vs_baseline")
    rms_ref = metrics_ref.get("rms") or 0
    if rmse is not None and rms_ref > 0 and rmse / rms_ref > 0.3:
        indicators.append(f"RMSE vs baseline is {rmse:.4f} ({rmse / rms_ref * 100:.1f}% of reference RMS)")

    return indicators
