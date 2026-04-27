import os

# All paths are resolved relative to the project root so the app works
# regardless of where it's launched from.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
TEMPLATES_DIR = os.path.join(PROJECT_ROOT, "app", "templates")
STATIC_DIR = os.path.join(PROJECT_ROOT, "app", "static")

RAW_DIR = os.path.join(DATA_DIR, "raw")
METRICS_DIR = os.path.join(DATA_DIR, "metrics")
COMPARISONS_DIR = os.path.join(DATA_DIR, "comparisons")
REPORTS_DIR = os.path.join(DATA_DIR, "reports")

# --- BBB resource limits ---
# BeagleBone Black: ARM Cortex-A8, 512MB RAM, 1GHz single core.
# 200k samples @ float64 = ~1.6MB; the heavier FFT/alignment stages use lower
# caps so analysis stays responsive and memory-bounded on the target.
MAX_SAMPLES = int(os.environ.get("MAX_SAMPLES", 200_000))
MAX_FFT_SAMPLES = int(os.environ.get("MAX_FFT_SAMPLES", min(MAX_SAMPLES, 131_072)))
MAX_ALIGNMENT_SAMPLES = int(os.environ.get("MAX_ALIGNMENT_SAMPLES", min(MAX_SAMPLES, 50_000)))
MAX_COMPARE_SAMPLES = int(os.environ.get("MAX_COMPARE_SAMPLES", 50_000))
# Keep uploads below the size of the retained demo waveform so the app does not
# fill the BBB eMMC with a handful of captures.
MAX_FILE_SIZE_MB = int(os.environ.get("MAX_FILE_SIZE_MB", 64))

# Default ADC sample rate for raw (headerless) BBB captures.
DEFAULT_SAMPLE_RATE = float(os.environ.get("DEFAULT_SAMPLE_RATE", 1000.0))
