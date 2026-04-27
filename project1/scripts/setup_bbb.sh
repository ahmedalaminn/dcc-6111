#!/usr/bin/env sh
set -eu

# BBB-friendly setup path:
# - uses Debian's python3-numpy package instead of compiling NumPy on device
# - installs only the lightweight web/runtime dependencies into a venv

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VENV_DIR="${PROJECT_ROOT}/.venv-bbb"

echo "[bbb] Installing OS packages..."
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip python3-numpy

echo "[bbb] Creating virtual environment at ${VENV_DIR}..."
python3 -m venv --system-site-packages "${VENV_DIR}"

echo "[bbb] Installing Flask/Jinja runtime requirements..."
"${VENV_DIR}/bin/pip" install --upgrade pip
"${VENV_DIR}/bin/pip" install -r "${PROJECT_ROOT}/requirements-bbb.txt"

cat <<EOF

[bbb] Setup complete.

Activate the environment:
  . "${VENV_DIR}/bin/activate"

Run the service:
  ./run_bbb.sh

Optional RAM-oriented environment defaults:
  export MAX_SAMPLES=200000
  export MAX_FFT_SAMPLES=131072
  export MAX_ALIGNMENT_SAMPLES=50000
  export MAX_COMPARE_SAMPLES=50000
  export MAX_FILE_SIZE_MB=64
EOF
