# Flask REST API — all the endpoints the frontend and CLI talk to.
# File-based storage only (no DB) to keep things lightweight for the BBB.

import csv
import io
import json
import os
import shlex
import shutil
import sys
import tempfile

from flask import Flask, jsonify, render_template, request, send_from_directory

from app.config import COMPARISONS_DIR, DATA_DIR, DEFAULT_SAMPLE_RATE, MAX_FILE_SIZE_MB, METRICS_DIR, RAW_DIR, REPORTS_DIR, STATIC_DIR, TEMPLATES_DIR
from app.core.analyzer import compute_metrics
from app.core.comparator import compare_waveforms, save_comparison
from app.ingest.parser import load_waveform, parse_binary, parse_raw_uint8, write_meta
from app.reports.generator import generate_report

# Scalar metric fields we write to CSV — excludes list types like fft_freqs
_METRIC_SCALAR_KEYS = [
    "filename", "timestamp_ms", "peak_to_peak", "max", "min",
    "rms", "mean", "std", "snr_db", "dominant_freq_hz",
    "dominant_freq_magnitude", "num_samples", "computed_at_ms",
]


def _has_wave_header(filepath):
    with open(filepath, "rb") as f:
        return f.read(4) == b"WAVE"


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


def create_app():
    app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)
    app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE_MB * 1024 * 1024

    # Make sure the data directories are there on first run
    for d in [RAW_DIR, METRICS_DIR, COMPARISONS_DIR, REPORTS_DIR]:
        os.makedirs(d, exist_ok=True)

    @app.route("/")
    def index():
        return render_template("index.html")

    # --- Sources ---

    @app.route("/api/sources")
    def list_sources():
        sources = []
        if os.path.exists(RAW_DIR):
            sources = sorted(d for d in os.listdir(RAW_DIR) if os.path.isdir(os.path.join(RAW_DIR, d)))
        return jsonify({"sources": sources})

    @app.route("/api/sources/<source_id>/waveforms")
    def list_waveforms(source_id):
        source_dir = os.path.join(RAW_DIR, source_id)
        if not os.path.exists(source_dir):
            return jsonify({"error": "Source not found"}), 404
        files = sorted(f for f in os.listdir(source_dir) if f.endswith(".bin"))
        return jsonify({"source": source_id, "waveforms": files})

    @app.route("/api/sources/<source_id>/waveforms/<filename>")
    def get_waveform(source_id, filename):
        filepath = os.path.join(RAW_DIR, source_id, filename)
        if not os.path.exists(filepath):
            return jsonify({"error": "File not found"}), 404
        try:
            wf = load_waveform(filepath)
            # Downsample for the response — sending all 60M points would be insane.
            # display_step and display_sample_rate tell the client what rate the
            # preview samples[] are actually at, so time-axis math stays correct.
            max_points = int(request.args.get("max_points", 1000))
            samples = wf.samples
            display_step = 1
            if len(samples) > max_points:
                display_step = len(samples) // max_points
                samples = samples[::display_step]
            return jsonify({
                "source_id": wf.source_id,
                "filename": wf.filename,
                "timestamp_ms": wf.timestamp_ms,
                "sample_rate": wf.sample_rate,
                "units": wf.units,
                "num_samples": wf.num_samples,
                "duration_s": wf.duration_s,
                "display_step": display_step,
                "display_sample_rate": wf.sample_rate / display_step,
                "samples": samples.tolist(),
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    @app.route("/api/sources/<source_id>/metrics")
    def get_metrics_history(source_id):
        metrics_file = os.path.join(METRICS_DIR, f"{source_id}_metrics.csv")
        if not os.path.exists(metrics_file):
            return jsonify({"source": source_id, "metrics": []})
        with open(metrics_file, newline="") as f:
            rows = list(csv.DictReader(f))
        return jsonify({"source": source_id, "metrics": rows})

    # --- Ingest ---

    @app.route("/api/ingest", methods=["POST"])
    def ingest():
        if "file" not in request.files:
            return jsonify({"error": "No file provided (field name: 'file')"}), 400

        file = request.files["file"]
        if not file.filename or not file.filename.endswith(".bin"):
            return jsonify({"error": "File must have a .bin extension"}), 400

        source_id_override = request.form.get("source_id")
        fmt = request.form.get("format", "auto")
        sample_rate_str = request.form.get("sample_rate", str(DEFAULT_SAMPLE_RATE))

        # Save upload to a temp file so we can peek at the header before committing
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        try:
            if fmt == "raw" or (fmt == "auto" and not _has_wave_header(tmp_path)):
                source_id = source_id_override or os.path.splitext(file.filename)[0]
                try:
                    sample_rate = float(sample_rate_str)
                except ValueError:
                    sample_rate = DEFAULT_SAMPLE_RATE
                wf = parse_raw_uint8(tmp_path, sample_rate=sample_rate, source_id=source_id)
            else:
                wf = parse_binary(tmp_path)
                if source_id_override:
                    wf.source_id = source_id_override

            dest_dir = os.path.join(RAW_DIR, wf.source_id)
            os.makedirs(dest_dir, exist_ok=True)
            dest_path = os.path.join(dest_dir, file.filename)
            shutil.move(tmp_path, dest_path)
            wf.filename = file.filename

            # Write sidecar so we know how to reload this file later
            if fmt == "raw" or (fmt == "auto" and not _has_wave_header(dest_path)):
                write_meta(dest_path, wf.sample_rate, wf.source_id, wf.units)

            metrics = compute_metrics(wf.samples, wf.sample_rate)
            _append_metrics_csv(wf.source_id, wf.filename, wf.timestamp_ms, metrics)

            return jsonify({
                "status": "ok",
                "source_id": wf.source_id,
                "filename": wf.filename,
                "num_samples": wf.num_samples,
                "sample_rate": wf.sample_rate,
                "duration_s": wf.duration_s,
                "metrics": {k: v for k, v in metrics.items() if not isinstance(v, list)},
            })
        except Exception as e:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            return jsonify({"error": str(e)}), 400

    # --- Compare ---

    @app.route("/api/compare", methods=["POST"])
    def compare():
        data = request.get_json()
        if not data:
            return jsonify({"error": "JSON body required"}), 400

        source_a = data.get("source_a")
        filename_a = data.get("filename_a")
        source_b = data.get("source_b")
        filename_b = data.get("filename_b")

        if not all([source_a, filename_a, source_b, filename_b]):
            return jsonify({"error": "Required: source_a, filename_a, source_b, filename_b"}), 400

        path_a = os.path.join(RAW_DIR, source_a, filename_a)
        path_b = os.path.join(RAW_DIR, source_b, filename_b)
        for path in [path_a, path_b]:
            if not os.path.exists(path):
                return jsonify({"error": f"File not found: {path}"}), 404

        # Cap at 50k samples — cross-correlation on full 60M-sample files kills the BBB.
        # 50k @ 200kHz = 0.25s of signal, which is plenty for a meaningful comparison.
        max_samples = int(data.get("max_samples", 50000))

        try:
            wf_a = load_waveform(path_a)
            wf_b = load_waveform(path_b)
            if len(wf_a.samples) > max_samples:
                wf_a.samples = wf_a.samples[:max_samples]
            if len(wf_b.samples) > max_samples:
                wf_b.samples = wf_b.samples[:max_samples]

            result = compare_waveforms(wf_a, wf_b)
            save_comparison(result, COMPARISONS_DIR)
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    @app.route("/api/comparisons")
    def list_comparisons():
        comparisons = []
        if os.path.exists(COMPARISONS_DIR):
            for fname in sorted(os.listdir(COMPARISONS_DIR)):
                if fname.endswith(".json"):
                    try:
                        with open(os.path.join(COMPARISONS_DIR, fname)) as f:
                            comparisons.append(json.load(f))
                    except Exception:
                        pass
        return jsonify({"comparisons": comparisons})

    # --- Reports ---

    @app.route("/api/reports/generate", methods=["POST"])
    def gen_report():
        data = request.get_json() or {}
        try:
            report_path = generate_report(
                data_dir=DATA_DIR,
                templates_dir=TEMPLATES_DIR,
                source_id=data.get("source_id"),
                comparison_id=data.get("comparison_id"),
            )
            return jsonify({"status": "ok", "report": os.path.basename(report_path)})
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    @app.route("/api/reports")
    def list_reports():
        reports = []
        if os.path.exists(REPORTS_DIR):
            reports = sorted(f for f in os.listdir(REPORTS_DIR) if f.endswith(".html"))
        return jsonify({"reports": reports})

    @app.route("/api/reports/<filename>")
    def get_report(filename):
        return send_from_directory(REPORTS_DIR, filename)

    # --- CLI via web ---

    @app.route("/api/cli", methods=["POST"])
    def run_cli():
        from app.cli.commands import build_parser, cmd_list_sources, cmd_analyze, cmd_compare, cmd_ingest, cmd_report

        data = request.get_json()
        if not data or not data.get("command"):
            return jsonify({"error": "JSON body with 'command' string required"}), 400

        raw_cmd = data["command"].strip()
        if not raw_cmd:
            return jsonify({"output": "", "exit_code": 0})

        # Block the monitor command — it's a blocking loop, not suitable for HTTP
        if raw_cmd.split()[0] == "monitor":
            return jsonify({"output": "Error: 'monitor' is not available in the web terminal.\n"
                                      "It runs a blocking watch loop — use it from a real terminal.",
                            "exit_code": 1})

        handlers = {
            "list-sources": cmd_list_sources,
            "analyze": cmd_analyze,
            "compare": cmd_compare,
            "ingest": cmd_ingest,
            "report": cmd_report,
        }

        # Parse the command through argparse, capturing any parse errors
        parser = build_parser()
        try:
            args = parser.parse_args(shlex.split(raw_cmd))
        except SystemExit:
            # argparse calls sys.exit on --help or bad args; capture the output
            buf = io.StringIO()
            try:
                parser.parse_args(shlex.split(raw_cmd))
            except SystemExit:
                pass
            # If it was --help or -h, return usage
            if "-h" in raw_cmd or "--help" in raw_cmd:
                help_buf = io.StringIO()
                parser.print_help(help_buf)
                return jsonify({"output": help_buf.getvalue(), "exit_code": 0})
            return jsonify({"output": f"Error: invalid command. Type 'help' for usage.\n", "exit_code": 1})

        handler = handlers.get(args.command)
        if not handler:
            return jsonify({"output": f"Error: unknown command '{args.command}'.\n", "exit_code": 1})

        # Capture stdout and stderr from the handler
        old_stdout, old_stderr = sys.stdout, sys.stderr
        sys.stdout = out_buf = io.StringIO()
        sys.stderr = err_buf = io.StringIO()
        try:
            exit_code = handler(args) or 0
        except Exception as e:
            exit_code = 1
            print(f"Error: {e}", file=sys.stderr)
        finally:
            sys.stdout, sys.stderr = old_stdout, old_stderr

        output = out_buf.getvalue() + err_buf.getvalue()
        return jsonify({"output": output, "exit_code": exit_code})

    return app
