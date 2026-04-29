#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VENV_DIR="${PROJECT_ROOT}/.venv-bbb"

export HOST="${HOST:-0.0.0.0}"
# Some BBB images already have a systemd-managed service on 8000.
export PORT="${PORT:-8080}"
export MAX_SAMPLES="${MAX_SAMPLES:-200000}"
export MAX_FFT_SAMPLES="${MAX_FFT_SAMPLES:-131072}"
export MAX_ALIGNMENT_SAMPLES="${MAX_ALIGNMENT_SAMPLES:-50000}"
export MAX_COMPARE_SAMPLES="${MAX_COMPARE_SAMPLES:-50000}"
export MAX_FILE_SIZE_MB="${MAX_FILE_SIZE_MB:-64}"

if [ -f "${VENV_DIR}/bin/activate" ]; then
  # shellcheck disable=SC1091
  . "${VENV_DIR}/bin/activate"
fi

cd "${PROJECT_ROOT}"
if [ -x "${VENV_DIR}/bin/python" ]; then
  exec "${VENV_DIR}/bin/python" app/main.py
fi

exec python3 app/main.py
