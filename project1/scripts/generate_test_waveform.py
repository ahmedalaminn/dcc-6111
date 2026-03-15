#!/usr/bin/env python3
"""
Generate synthetic binary waveform files for testing.

Usage:
  python scripts/generate_test_waveform.py
  python scripts/generate_test_waveform.py --source sourceA --freq 50 --noise 0.05 --output data/raw/sourceA/capture_001.bin
  python scripts/generate_test_waveform.py --list-presets
"""

import argparse
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingest.parser import WaveformData, write_binary

PRESETS = {
    "sine_10hz": dict(freq=10.0, sample_rate=1000.0, duration=1.0, noise=0.02, waveform="sine"),
    "sine_50hz": dict(freq=50.0, sample_rate=4000.0, duration=0.5, noise=0.01, waveform="sine"),
    "square_5hz": dict(freq=5.0, sample_rate=1000.0, duration=2.0, noise=0.05, waveform="square"),
    "chirp": dict(freq=1.0, sample_rate=2000.0, duration=1.0, noise=0.01, waveform="chirp", freq_end=100.0),
    "degraded": dict(freq=10.0, sample_rate=1000.0, duration=1.0, noise=0.3, waveform="sine"),
}


def generate_samples(
    waveform: str,
    freq: float,
    sample_rate: float,
    duration: float,
    noise: float,
    amplitude: float = 1.0,
    freq_end: float = None,
    seed: int = None,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(sample_rate * duration)
    t = np.linspace(0, duration, n, endpoint=False)

    if waveform == "sine":
        signal = amplitude * np.sin(2 * np.pi * freq * t)
    elif waveform == "square":
        signal = amplitude * np.sign(np.sin(2 * np.pi * freq * t))
    elif waveform == "sawtooth":
        signal = amplitude * (2 * (t * freq - np.floor(t * freq + 0.5)))
    elif waveform == "chirp":
        f_end = freq_end if freq_end else freq * 10
        phase = 2 * np.pi * (freq * t + (f_end - freq) / (2 * duration) * t**2)
        signal = amplitude * np.sin(phase)
    else:
        raise ValueError(f"Unknown waveform type: {waveform}")

    if noise > 0:
        signal += rng.normal(0, noise, n)

    return signal


def build_waveform(
    source_id: str,
    waveform: str,
    freq: float,
    sample_rate: float,
    duration: float,
    noise: float,
    amplitude: float = 1.0,
    units: str = "V",
    freq_end: float = None,
    seed: int = None,
) -> WaveformData:
    samples = generate_samples(
        waveform=waveform,
        freq=freq,
        sample_rate=sample_rate,
        duration=duration,
        noise=noise,
        amplitude=amplitude,
        freq_end=freq_end,
        seed=seed,
    )
    return WaveformData(
        source_id=source_id,
        timestamp_ms=int(time.time() * 1000),
        sample_rate=sample_rate,
        units=units,
        samples=samples,
    )


def generate_default_set(output_dir: str = "data/raw"):
    """Generate a default set of test waveforms for both sourceA and sourceB."""
    configs = [
        # sourceA: clean 10 Hz sine, then slightly degraded
        ("sourceA", "capture_001.bin", "sine", 10.0, 1000.0, 1.0, 0.02, 0),
        ("sourceA", "capture_002.bin", "sine", 10.0, 1000.0, 1.0, 0.05, 1),
        ("sourceA", "capture_003.bin", "sine", 10.0, 1000.0, 0.8, 0.08, 2),  # amplitude drop
        # sourceB: 50 Hz sine
        ("sourceB", "capture_001.bin", "sine", 50.0, 4000.0, 1.0, 0.01, 10),
        ("sourceB", "capture_002.bin", "sine", 50.0, 4000.0, 1.0, 0.02, 11),
    ]

    for src, fname, wtype, freq, sr, amp, noise, seed in configs:
        wf = build_waveform(
            source_id=src,
            waveform=wtype,
            freq=freq,
            sample_rate=sr,
            duration=1.0,
            noise=noise,
            amplitude=amp,
            units="V",
            seed=seed,
        )
        dest = os.path.join(output_dir, src, fname)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        write_binary(wf, dest)
        print(f"  Written: {dest}  ({wf.num_samples} samples @ {sr} Hz)")


def main():
    parser = argparse.ArgumentParser(description="Generate test binary waveform files")
    parser.add_argument("--source", default=None, help="Source ID (default: auto from preset or 'testSource')")
    parser.add_argument("--freq", type=float, default=10.0, help="Signal frequency in Hz")
    parser.add_argument("--freq-end", type=float, default=None, help="End frequency for chirp")
    parser.add_argument("--sample-rate", type=float, default=1000.0, help="Sample rate in Hz")
    parser.add_argument("--duration", type=float, default=1.0, help="Duration in seconds")
    parser.add_argument("--noise", type=float, default=0.02, help="Noise std deviation")
    parser.add_argument("--amplitude", type=float, default=1.0, help="Signal amplitude")
    parser.add_argument("--waveform", default="sine", choices=["sine", "square", "sawtooth", "chirp"])
    parser.add_argument("--units", default="V")
    parser.add_argument("--output", default=None, help="Output .bin path (default: data/raw/<source>/<timestamp>.bin)")
    parser.add_argument("--preset", choices=list(PRESETS.keys()), help="Use a named preset")
    parser.add_argument("--list-presets", action="store_true", help="List available presets and exit")
    parser.add_argument("--generate-default-set", action="store_true", help="Generate default test set for sourceA and sourceB")

    args = parser.parse_args()

    if args.list_presets:
        print("Available presets:")
        for name, cfg in PRESETS.items():
            print(f"  {name}: {cfg}")
        return

    if args.generate_default_set:
        print("Generating default test waveform set...")
        generate_default_set()
        print("Done.")
        return

    # Apply preset if given
    cfg = {}
    if args.preset:
        cfg = PRESETS[args.preset].copy()

    waveform = cfg.get("waveform", args.waveform)
    freq = cfg.get("freq", args.freq)
    sample_rate = cfg.get("sample_rate", args.sample_rate)
    duration = cfg.get("duration", args.duration)
    noise = cfg.get("noise", args.noise)
    freq_end = cfg.get("freq_end", args.freq_end)
    source_id = args.source or (args.preset or "testSource")

    wf = build_waveform(
        source_id=source_id,
        waveform=waveform,
        freq=freq,
        sample_rate=sample_rate,
        duration=duration,
        noise=noise,
        amplitude=args.amplitude,
        units=args.units,
        freq_end=freq_end,
    )

    if args.output:
        out_path = args.output
    else:
        ts = int(time.time() * 1000)
        out_dir = os.path.join("data", "raw", source_id)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"capture_{ts}.bin")

    write_binary(wf, out_path)
    print(f"Written: {out_path}")
    print(f"  Source:      {wf.source_id}")
    print(f"  Waveform:    {waveform} @ {freq} Hz")
    print(f"  Sample rate: {sample_rate} Hz")
    print(f"  Duration:    {duration} s  ({wf.num_samples} samples)")
    print(f"  Noise:       {noise}")


if __name__ == "__main__":
    main()
