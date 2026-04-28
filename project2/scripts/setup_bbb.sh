#!/usr/bin/env bash
set -eu

echo "[bbb] Installing minimal runtime packages"
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-flask python3-zmq

echo "[bbb] Optional pip fallback"
echo "[bbb] If the OS packages are unavailable, run:"
echo "  python3 -m pip install --no-cache-dir -r python/requirements-bbb.txt"
