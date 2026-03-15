"""Tests for binary waveform parser."""

import os
import sys
import tempfile
import time

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingest.parser import WaveformData, parse_binary, write_binary


def make_waveform(source_id="testSource", sample_rate=1000.0, units="V", n=500):
    t = np.linspace(0, 1, n)
    samples = np.sin(2 * np.pi * 10 * t)
    return WaveformData(
        source_id=source_id,
        timestamp_ms=int(time.time() * 1000),
        sample_rate=sample_rate,
        units=units,
        samples=samples,
    )


def test_roundtrip_basic():
    wf = make_waveform()
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        tmp = f.name
    try:
        write_binary(wf, tmp)
        loaded = parse_binary(tmp)
        assert loaded.source_id == wf.source_id
        assert loaded.sample_rate == wf.sample_rate
        assert loaded.units == wf.units
        assert loaded.num_samples == wf.num_samples
        assert loaded.timestamp_ms == wf.timestamp_ms
        np.testing.assert_allclose(loaded.samples, wf.samples, atol=1e-5)
    finally:
        os.unlink(tmp)


def test_roundtrip_source_id_max_length():
    wf = make_waveform(source_id="a" * 32)
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        tmp = f.name
    try:
        write_binary(wf, tmp)
        loaded = parse_binary(tmp)
        assert loaded.source_id == "a" * 32
    finally:
        os.unlink(tmp)


def test_roundtrip_source_id_truncated():
    wf = make_waveform(source_id="x" * 40)
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        tmp = f.name
    try:
        write_binary(wf, tmp)
        loaded = parse_binary(tmp)
        assert len(loaded.source_id) == 32
    finally:
        os.unlink(tmp)


def test_invalid_magic():
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(b"BADI" + b"\x00" * 100)
        tmp = f.name
    try:
        with pytest.raises(ValueError, match="magic"):
            parse_binary(tmp)
    finally:
        os.unlink(tmp)


def test_file_too_small():
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(b"WAVE\x01")
        tmp = f.name
    try:
        with pytest.raises(ValueError):
            parse_binary(tmp)
    finally:
        os.unlink(tmp)


def test_duration():
    wf = make_waveform(sample_rate=500.0, n=1000)
    assert abs(wf.duration_s - 2.0) < 1e-6


def test_large_waveform_roundtrip():
    wf = make_waveform(n=10000)
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        tmp = f.name
    try:
        write_binary(wf, tmp)
        loaded = parse_binary(tmp)
        assert loaded.num_samples == 10000
        np.testing.assert_allclose(loaded.samples, wf.samples, atol=1e-5)
    finally:
        os.unlink(tmp)
