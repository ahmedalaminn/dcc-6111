#!/usr/bin/env bash
set -eu

XPUB_BIND="${XPUB_BIND:-tcp://0.0.0.0:5555}"
XSUB_BIND="${XSUB_BIND:-tcp://0.0.0.0:5556}"
BROKER_HWM="${BROKER_HWM:-200}"

cd "$(dirname "$0")"
exec python3 python/broker.py --xpub-bind "$XPUB_BIND" --xsub-bind "$XSUB_BIND" --hwm "$BROKER_HWM"
