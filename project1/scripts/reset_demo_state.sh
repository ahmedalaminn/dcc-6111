#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

reset_dir() {
  target_dir="$1"
  find "${target_dir}" -mindepth 1 ! -name '.gitkeep' -delete
}

reset_dir "${PROJECT_ROOT}/data/metrics"
reset_dir "${PROJECT_ROOT}/data/comparisons"
reset_dir "${PROJECT_ROOT}/data/reports"

echo "[waveform-monitor] Cleared generated metrics, comparisons, and reports."
