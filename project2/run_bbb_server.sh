#!/usr/bin/env bash
set -eu

BBB_BROKER_ENDPOINT="${BBB_BROKER_ENDPOINT:-tcp://127.0.0.1:5555}"
BBB_DASH_HOST="${BBB_DASH_HOST:-0.0.0.0}"
BBB_DASH_PORT="${BBB_DASH_PORT:-5000}"
BBB_TOPIC="${BBB_TOPIC:-diag}"

cd "$(dirname "$0")"
exec python3 python/server.py --endpoint "$BBB_BROKER_ENDPOINT" --host "$BBB_DASH_HOST" --port "$BBB_DASH_PORT" --topic "$BBB_TOPIC"
