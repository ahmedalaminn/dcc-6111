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
# 200k samples @ float64 = ~1.6MB — safe headroom for FFT + intermediate arrays.
MAX_SAMPLES = int(os.environ.get("MAX_SAMPLES", 200_000))
# Reject uploads larger than this to avoid filling eMMC / exhausting RAM during parse.
MAX_FILE_SIZE_MB = int(os.environ.get("MAX_FILE_SIZE_MB", 100))

# Default ADC sample rate for raw (headerless) BBB captures.
DEFAULT_SAMPLE_RATE = float(os.environ.get("DEFAULT_SAMPLE_RATE", 1000.0))
