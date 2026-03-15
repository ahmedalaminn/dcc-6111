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
