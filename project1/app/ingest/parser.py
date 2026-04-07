# Handles reading/writing waveform binary files.
#
# We use a custom binary format (WAVE v1) for files we generate ourselves.
# Files coming off the BBB's ADC are just raw uint8 bytes with no header,
# so those get a small .meta.json sidecar to store the sample rate.
#
# WAVE v1 layout (all big-endian):
#   0-3    magic: "WAVE"
#   4      version: 1
#   5-36   source_id (32 bytes, null-padded)
#   37-44  timestamp_ms (int64)
#   45-48  sample_rate in Hz (float32)
#   49-64  units (16 bytes, null-padded)
#   65-68  num_samples (uint32)
#   69+    samples as float32[]

import json
import os
import struct
import time
from dataclasses import dataclass

import numpy as np

from app.config import MAX_SAMPLES

MAGIC = b"WAVE"
VERSION = 1

HEADER_FMT = ">4sB32sqf16sI"
HEADER_SIZE = struct.calcsize(HEADER_FMT)  # 69 bytes


@dataclass
class WaveformData:
    source_id: str
    timestamp_ms: int
    sample_rate: float
    units: str
    samples: np.ndarray
    filename: str = ""

    @property
    def duration_s(self):
        return len(self.samples) / self.sample_rate if self.sample_rate > 0 else 0.0

    @property
    def num_samples(self):
        return len(self.samples)


def parse_binary(filepath, max_samples=None):
    # Check magic bytes first — if it's not our format, tell the caller to use parse_raw_uint8
    with open(filepath, "rb") as f:
        magic = f.read(4)

    if magic == MAGIC:
        return _parse_wave_v1(filepath, max_samples=max_samples)

    raise ValueError(
        f"'{os.path.basename(filepath)}' has no WAVE header — "
        "looks like a raw ADC capture. Use parse_raw_uint8() instead."
    )


def _parse_wave_v1(filepath, max_samples=None):
    if max_samples is None:
        max_samples = MAX_SAMPLES
    with open(filepath, "rb") as f:
        header_bytes = f.read(HEADER_SIZE)
        if len(header_bytes) < HEADER_SIZE:
            raise ValueError(f"File too small to contain a valid header: {filepath}")

        magic, version, source_id_bytes, timestamp_ms, sample_rate, units_bytes, num_samples = (
            struct.unpack(HEADER_FMT, header_bytes)
        )

        if magic != MAGIC:
            raise ValueError(f"Bad magic bytes: {magic!r}")
        if version != VERSION:
            raise ValueError(f"Unknown version {version}, expected {VERSION}")

        source_id = source_id_bytes.rstrip(b"\x00").decode("utf-8")
        units = units_bytes.rstrip(b"\x00").decode("utf-8")

        # Only read up to max_samples to stay within BBB memory limits
        read_count = min(num_samples, max_samples)
        sample_bytes = f.read(read_count * 4)
        if len(sample_bytes) < read_count * 4:
            raise ValueError(f"File appears truncated ({filepath})")

        # big-endian float32 → float64 for all internal processing
        samples = np.frombuffer(sample_bytes, dtype=">f4").astype(np.float64)

    return WaveformData(
        source_id=source_id,
        timestamp_ms=timestamp_ms,
        sample_rate=sample_rate,
        units=units,
        samples=samples,
        filename=os.path.basename(filepath),
    )


def parse_raw_uint8(filepath, sample_rate, source_id, units="ADC counts", max_samples=None):
    if max_samples is None:
        max_samples = MAX_SAMPLES
    # BBB ADC output is raw uint8 with a DC offset around mid-scale (~128-139).
    # Read only up to max_samples bytes to stay within BBB memory limits
    # (each uint8 sample = 1 byte, so byte count == sample count).
    with open(filepath, "rb") as f:
        raw = np.frombuffer(f.read(max_samples), dtype=np.uint8)
    samples = raw.astype(np.float64)
    samples -= samples.mean()

    return WaveformData(
        source_id=source_id,
        timestamp_ms=int(time.time() * 1000),
        sample_rate=float(sample_rate),
        units=units,
        samples=samples,
        filename=os.path.basename(filepath),
    )


def _meta_path(filepath):
    return filepath + ".meta.json"


def write_meta(filepath, sample_rate, source_id, units):
    # Sidecar file so we know how to reload a raw binary later
    with open(_meta_path(filepath), "w") as f:
        json.dump({
            "format": "raw_uint8",
            "sample_rate": sample_rate,
            "source_id": source_id,
            "units": units,
        }, f)


def load_waveform(filepath, max_samples=None):
    # If there's a sidecar, it's a raw ADC file — use that metadata to parse it.
    # Otherwise fall back to the WAVE v1 parser.
    meta_file = _meta_path(filepath)
    if os.path.exists(meta_file):
        with open(meta_file) as f:
            meta = json.load(f)
        return parse_raw_uint8(
            filepath,
            sample_rate=meta["sample_rate"],
            source_id=meta["source_id"],
            units=meta.get("units", "ADC counts"),
            max_samples=max_samples,
        )
    return _parse_wave_v1(filepath, max_samples=max_samples)


def write_binary(waveform, filepath):
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)

    # Pad string fields to fixed widths required by the header format
    sid = waveform.source_id.encode("utf-8")[:32]
    sid_padded = sid + b"\x00" * (32 - len(sid))

    u = waveform.units.encode("utf-8")[:16]
    u_padded = u + b"\x00" * (16 - len(u))

    header = struct.pack(
        HEADER_FMT,
        MAGIC,
        VERSION,
        sid_padded,
        waveform.timestamp_ms,
        waveform.sample_rate,
        u_padded,
        len(waveform.samples),
    )

    with open(filepath, "wb") as f:
        f.write(header)
        f.write(waveform.samples.astype(">f4").tobytes())
