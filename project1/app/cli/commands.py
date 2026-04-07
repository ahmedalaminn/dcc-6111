# CLI for the waveform monitor. Run as:
#   python -m app.cli.commands <command> [options]
#
# Commands: list-sources, ingest, analyze, compare, monitor, report

import argparse
import csv
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.config import COMPARISONS_DIR, DATA_DIR, MAX_FILE_SIZE_MB, METRICS_DIR, RAW_DIR, TEMPLATES_DIR
from app.core.analyzer import compute_metrics
from app.core.comparator import compare_waveforms, save_comparison
from app.ingest.parser import load_waveform, parse_binary, parse_raw_uint8, write_meta
from app.reports.generator import generate_report

_METRIC_SCALAR_KEYS = [
    "filename", "timestamp_ms", "peak_to_peak", "max", "min", "rms",
    "mean", "std", "snr_db", "dominant_freq_hz", "dominant_freq_magnitude",
    "num_samples", "computed_at_ms",
]


def _append_metrics_csv(source_id, filename, timestamp_ms, metrics):
    os.makedirs(METRICS_DIR, exist_ok=True)
    metrics_file = os.path.join(METRICS_DIR, f"{source_id}_metrics.csv")
    row = {k: metrics.get(k) for k in _METRIC_SCALAR_KEYS}
    row["filename"] = filename
    row["timestamp_ms"] = timestamp_ms
    write_header = not os.path.exists(metrics_file)
    with open(metrics_file, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=_METRIC_SCALAR_KEYS)
        if write_header:
            writer.writeheader()
        writer.writerow(row)


def cmd_list_sources(args):
    if not os.path.exists(RAW_DIR):
        print("No sources found (data/raw/ does not exist).")
        return 0

    sources = sorted(
        d for d in os.listdir(RAW_DIR)
        if os.path.isdir(os.path.join(RAW_DIR, d))
    )

    if not sources:
        print("No sources found.")
        return 0

    print(f"\n{'Source':<32} {'Files':>6}  {'Total Size':>12}")
    print("-" * 54)

    total_files = 0
    total_bytes = 0
    for src in sources:
        src_dir = os.path.join(RAW_DIR, src)
        bins = [f for f in os.listdir(src_dir) if f.endswith(".bin")]
        size = sum(os.path.getsize(os.path.join(src_dir, f)) for f in bins)
        total_files += len(bins)
        total_bytes += size

        if size >= 1024 * 1024:
            size_str = f"{size / (1024 * 1024):.1f} MB"
        elif size >= 1024:
            size_str = f"{size / 1024:.1f} KB"
        else:
            size_str = f"{size} B"

        print(f"  {src:<30} {len(bins):>6}  {size_str:>12}")

    print("-" * 54)
    if total_bytes >= 1024 * 1024:
        total_str = f"{total_bytes / (1024 * 1024):.1f} MB"
    elif total_bytes >= 1024:
        total_str = f"{total_bytes / 1024:.1f} KB"
    else:
        total_str = f"{total_bytes} B"
    print(f"  {'Total':<30} {total_files:>6}  {total_str:>12}\n")
    return 0


def cmd_ingest(args):
    if not os.path.exists(args.input):
        print(f"Error: file not found: {args.input}", file=sys.stderr)
        return 1

    with open(args.input, "rb") as f:
        is_wave = f.read(4) == b"WAVE"

    # Decide how to parse — auto-detect by header, or force with --format
    if args.format == "raw" or (args.format == "auto" and not is_wave):
        source_id = args.source_id or os.path.splitext(os.path.basename(args.input))[0]
        wf = parse_raw_uint8(args.input, sample_rate=args.sample_rate, source_id=source_id)
        print(f"  Format: raw uint8 (BBB ADC) @ {args.sample_rate} Hz")
    else:
        wf = parse_binary(args.input)
        if args.source_id:
            wf.source_id = args.source_id

    dest_dir = os.path.join(RAW_DIR, wf.source_id)
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, os.path.basename(args.input))
    shutil.copy2(args.input, dest_path)
    wf.filename = os.path.basename(args.input)

    if args.format == "raw" or (args.format == "auto" and not is_wave):
        write_meta(dest_path, wf.sample_rate, wf.source_id, wf.units)

    metrics = compute_metrics(wf.samples, wf.sample_rate)
    _append_metrics_csv(wf.source_id, wf.filename, wf.timestamp_ms, metrics)

    print(f"Ingested: {args.input}")
    print(f"  Source:      {wf.source_id}")
    print(f"  Samples:     {wf.num_samples}")
    print(f"  Sample rate: {wf.sample_rate} Hz")
    print(f"  Duration:    {wf.duration_s:.3f} s")
    print(f"  Stored at:   {dest_path}")
    return 0


def cmd_analyze(args):
    filepath = args.input
    # If the path doesn't exist directly, search inside data/raw/
    if not os.path.exists(filepath):
        for root, _, files in os.walk(RAW_DIR):
            if os.path.basename(filepath) in files:
                filepath = os.path.join(root, os.path.basename(filepath))
                break

    if not os.path.exists(filepath):
        print(f"Error: file not found: {args.input}", file=sys.stderr)
        return 1

    wf = load_waveform(filepath)
    m = compute_metrics(wf.samples, wf.sample_rate)

    print(f"\nWaveform: {wf.filename}")
    print(f"  Source:         {wf.source_id}")
    print(f"  Sample rate:    {wf.sample_rate} Hz")
    print(f"  Samples:        {wf.num_samples}")
    print(f"  Duration:       {wf.duration_s:.3f} s")
    print(f"  Units:          {wf.units}")
    print(f"\nSignal Metrics:")
    print(f"  Peak-to-peak:   {m['peak_to_peak']:.6f}")
    print(f"  RMS:            {m['rms']:.6f}")
    print(f"  Mean:           {m['mean']:.6f}")
    print(f"  Std dev:        {m['std']:.6f}")
    snr = m.get("snr_db")
    print(f"  SNR:            {f'{snr:.2f} dB' if snr is not None else 'N/A'}")
    print(f"  Dominant freq:  {m['dominant_freq_hz']:.2f} Hz")
    return 0


def cmd_compare(args):
    for p in [args.a, args.b]:
        if not os.path.exists(p):
            print(f"Error: file not found: {p}", file=sys.stderr)
            return 1

    wf_a = load_waveform(args.a)
    wf_b = load_waveform(args.b)
    result = compare_waveforms(wf_a, wf_b)
    save_comparison(result, COMPARISONS_DIR)

    print(f"\n{result['label_a']}  vs  {result['label_b']}")
    print(f"  RMSE:          {result['rmse']:.6f}")
    print(f"  Correlation:   {result['correlation']:.4f}")
    print(f"  Lag:           {result['alignment_lag_samples']} samples")

    if result["degradation_indicators"]:
        print("\nDegradation indicators:")
        for ind in result["degradation_indicators"]:
            print(f"  ⚠  {ind}")
    else:
        print("\n  No degradation detected.")

    print(f"\nSaved: {result['id']}.json")
    return 0


def cmd_monitor(args):
    if not os.path.exists(args.dir):
        print(f"Error: directory not found: {args.dir}", file=sys.stderr)
        return 1

    print(f"Watching {args.dir} for new .bin files (Ctrl+C to stop)...")
    seen = set(os.listdir(args.dir))

    try:
        while True:
            current = set(os.listdir(args.dir))
            for fname in sorted(current - seen):
                if not fname.endswith(".bin"):
                    continue
                fpath = os.path.join(args.dir, fname)
                size_mb = os.path.getsize(fpath) / (1024 * 1024)
                if size_mb > MAX_FILE_SIZE_MB:
                    print(f"  Skipping {fname}: {size_mb:.0f} MB exceeds {MAX_FILE_SIZE_MB} MB limit",
                          file=sys.stderr)
                    continue
                print(f"  New file: {fname}")
                try:
                    wf = parse_binary(fpath)
                    dest_dir = os.path.join(RAW_DIR, wf.source_id)
                    os.makedirs(dest_dir, exist_ok=True)
                    shutil.copy2(fpath, os.path.join(dest_dir, fname))
                    wf.filename = fname
                    metrics = compute_metrics(wf.samples, wf.sample_rate)
                    _append_metrics_csv(wf.source_id, fname, wf.timestamp_ms, metrics)
                    print(f"    -> {wf.source_id}/{fname}")
                except Exception as e:
                    print(f"    Error: {e}", file=sys.stderr)
            seen = current
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


def cmd_report(args):
    report_path = generate_report(
        data_dir=DATA_DIR,
        templates_dir=TEMPLATES_DIR,
        source_id=args.source,
        comparison_id=args.comparison,
    )
    print(f"Report: {report_path}")
    if args.output and args.output != report_path:
        shutil.copy2(report_path, args.output)
        print(f"Copied to: {args.output}")
    return 0


def build_parser():
    parser = argparse.ArgumentParser(prog="waveform-cli", description="Waveform Monitor CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list-sources", help="List all ingested waveform sources")

    p = sub.add_parser("ingest", help="Ingest a binary waveform file")
    p.add_argument("input", help="Path to .bin file")
    p.add_argument("--source-id", help="Source ID (auto-derived from filename if not set)")
    p.add_argument("--format", choices=["auto", "wave", "raw"], default="auto",
                   help="auto=detect by header, wave=WAVE v1, raw=uint8 ADC (default: auto)")
    p.add_argument("--sample-rate", type=float, default=200000.0,
                   help="Sample rate for raw files in Hz (default: 200000)")

    p = sub.add_parser("analyze", help="Print signal metrics for a waveform")
    p.add_argument("--input", required=True, help="Path to .bin file")

    p = sub.add_parser("compare", help="Compare two waveform files")
    p.add_argument("--a", required=True, help="First .bin file")
    p.add_argument("--b", required=True, help="Second .bin file")

    p = sub.add_parser("monitor", help="Watch a directory for new .bin files")
    p.add_argument("--dir", required=True, help="Directory to watch")
    p.add_argument("--interval", type=float, default=2.0, help="Poll interval in seconds")

    p = sub.add_parser("report", help="Generate an HTML report")
    p.add_argument("--source", help="Source ID")
    p.add_argument("--comparison", help="Comparison ID")
    p.add_argument("--output", help="Output path (optional)")

    return parser


def main():
    args = build_parser().parse_args()
    handlers = {
        "list-sources": cmd_list_sources,
        "ingest": cmd_ingest,
        "analyze": cmd_analyze,
        "compare": cmd_compare,
        "monitor": cmd_monitor,
        "report": cmd_report,
    }
    sys.exit(handlers[args.command](args) or 0)


if __name__ == "__main__":
    main()
