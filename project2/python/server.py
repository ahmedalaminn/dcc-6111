"""
server.py
---------
Flask web server for the SLB Distributed PubSub Network Logger.

Replaces the DearPyGui frontend with a browser-based dashboard served over
HTTP. Compatible with headless BeagleBone Black (no OpenGL/display required).

Routes
------
  GET  /        Dashboard HTML
  GET  /stream  Server-Sent Events stream (real-time log + node status)
  POST /toggle  Toggle diagnostic logging  body: {"enabled": <bool>}

Run
---
  python3 server.py                                # default endpoint
  python3 server.py --endpoint tcp://192.168.1.10:5555
  python3 server.py --demo                         # synthetic data, no ZMQ
  python3 server.py --host 0.0.0.0 --port 5000    # explicit bind (defaults)
"""

import argparse
import collections
import json
import queue
import random
import threading
import time
from datetime import datetime

from flask import Flask, Response, jsonify, render_template, request
from flask_cors import CORS

import sys
import os

from proto.log_message_pb2 import LogMessage
from zmq_subscriber import ZmqSubscriber

# -- Constants ------------------------------------------------------------------
DEFAULT_ENDPOINT      = "tcp://localhost:5555"
DEFAULT_HOST          = "0.0.0.0"
DEFAULT_PORT          = 5000

MAX_NODES             = 5
NODE_TIMEOUT_S        = 10.0
MAX_LOG_ROWS          = 200
NODE_CHECK_INTERVAL_S = 1.0
SSE_HEARTBEAT_S       = 15.0   # keep connection alive through NAT/proxies

# -- Flask app ------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

# -- Shared state ---------------------------------------------------------------
_logging_enabled: bool = True
_logging_lock          = threading.Lock()

# node_id -> last-seen epoch (float)
_node_last_seen: dict  = {}
_node_lock             = threading.Lock()

# Per-SSE-client queues  (queue.Queue[tuple[str, dict]])
_clients: list         = []
_clients_lock          = threading.Lock()


# -- Broadcast helpers ----------------------------------------------------------

def _broadcast(event_type: str, data: dict) -> None:
    """Push an event to every connected SSE client. Drop silently if full."""
    with _clients_lock:
        dead = []
        for q in _clients:
            try:
                q.put_nowait((event_type, data))
            except queue.Full:
                dead.append(q)
        for q in dead:
            _clients.remove(q)


# -- Message ingestion ----------------------------------------------------------

def _ingest(msg: LogMessage) -> None:
    """
    Called from any background thread when a new LogMessage arrives.
    Updates node tracking and fans the message out to SSE clients.
    """
    now = time.time()

    with _logging_lock:
        logging_on = _logging_enabled

    # Update node last-seen; detect first appearance
    with _node_lock:
        is_new = msg.node_id not in _node_last_seen
        if len(_node_last_seen) < MAX_NODES or not is_new:
            _node_last_seen[msg.node_id] = now

    if is_new and len(_node_last_seen) <= MAX_NODES:
        _broadcast("node_status", {"node_id": msg.node_id, "status": "ok"})

    if logging_on:
        ts = datetime.fromtimestamp(msg.timestamp_ms / 1000).strftime(
            "%H:%M:%S.%f"
        )[:-3]
        _broadcast(
            "log",
            {
                "ts":      ts,
                "node_id": msg.node_id,
                "payload": msg.payload,
                "topic":   msg.topic,
            },
        )


# -- Node watchdog thread -------------------------------------------------------

def _node_watchdog(stop_evt: threading.Event) -> None:
    """Periodically detects timed-out nodes and broadcasts status updates."""
    prev_status: dict = {}  # node_id -> "ok" | "lost"

    while not stop_evt.is_set():
        now = time.time()
        with _node_lock:
            snapshot = dict(_node_last_seen)

        for node_id, last_seen in snapshot.items():
            status = "lost" if (now - last_seen) > NODE_TIMEOUT_S else "ok"
            if prev_status.get(node_id) != status:
                prev_status[node_id] = status
                _broadcast("node_status", {"node_id": node_id, "status": status})

        stop_evt.wait(NODE_CHECK_INTERVAL_S)


# -- Demo producer thread -------------------------------------------------------

def _demo_producer(stop_evt: threading.Event) -> None:
    """Generates synthetic LogMessage objects."""
    node_ids = [f"node-{i}" for i in range(1, 6)]
    payloads = [
        "heartbeat OK",
        "sensor_temp=72.3C",
        "seismic_amp=0.003g",
        "sample_rate=250Hz",
        "packet_loss=0.02%",
        "link_quality=98",
        "buffer_overflow WARNING",
        "reconnect attempt #1",
        "CRC_error on frame 0x3F",
        "gps_lock=OK lat=29.7604 lon=-95.3698",
        "battery=87%",
        "disk_free=1.2GB",
    ]

    while not stop_evt.is_set():
        msg = LogMessage(
            node_id=random.choice(node_ids),
            timestamp_ms=int(time.time() * 1000),
            payload=random.choice(payloads),
            topic="diag",
        )
        _ingest(msg)
        stop_evt.wait(random.uniform(0.3, 1.2))


# -- Routes ---------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/stream")
def stream():
    """
    SSE endpoint. Each browser tab gets a queue so slow clients
    do not block others. The generator cleans up on disconnect.
    """
    client_q: queue.Queue = queue.Queue(maxsize=200)

    with _clients_lock:
        _clients.append(client_q)

    def generate():
        try:
            while True:
                try:
                    event_type, data = client_q.get(timeout=SSE_HEARTBEAT_S)
                    yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
                except queue.Empty:
                    # Heartbeat comment keeps the TCP connection alive
                    yield ": heartbeat\n\n"
        except GeneratorExit:
            pass
        finally:
            with _clients_lock:
                if client_q in _clients:
                    _clients.remove(client_q)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering if proxied
        },
    )


@app.route("/toggle", methods=["POST"])
def toggle():
    global _logging_enabled
    data = request.get_json(force=True)
    with _logging_lock:
        _logging_enabled = bool(data.get("enabled", True))
        state = _logging_enabled
    return jsonify({"enabled": state})


# -- Entry point ----------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="SLB PubSub Network Logger - Web Dashboard"
    )
    parser.add_argument(
        "--endpoint", default=DEFAULT_ENDPOINT,
        help=f"ZeroMQ XPUB endpoint to subscribe to (default: {DEFAULT_ENDPOINT})",
    )
    parser.add_argument(
        "--topic", default="",
        help="ZeroMQ subscription topic filter (default: all)",
    )
    parser.add_argument(
        "--host", default=DEFAULT_HOST,
        help=f"Web server bind address (default: {DEFAULT_HOST})",
    )
    parser.add_argument(
        "--port", type=int, default=DEFAULT_PORT,
        help=f"Web server port (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--demo", action="store_true",
        help="Run with synthetic demo data instead of a live ZMQ feed",
    )
    args = parser.parse_args()

    stop_evt = threading.Event()

    # -- Start data source ------------------------------------------------------
    if args.demo:
        print("[server] Demo mode - synthetic data enabled.")
        src = threading.Thread(
            target=_demo_producer, args=(stop_evt,),
            name="DemoProducer", daemon=True,
        )
        src.start()
    else:
        msg_queue: queue.Queue = queue.Queue(maxsize=500)
        subscriber = ZmqSubscriber(
            endpoint=args.endpoint,
            topic=args.topic.encode(),
            out_queue=msg_queue,
        )
        subscriber.start()

        # Bridge: drain the ZmqSubscriber queue and feed _ingest()
        def _bridge(stop_evt: threading.Event) -> None:
            while not stop_evt.is_set():
                try:
                    msg = msg_queue.get(timeout=0.5)
                    _ingest(msg)
                except queue.Empty:
                    pass

        threading.Thread(
            target=_bridge, args=(stop_evt,),
            name="QueueBridge", daemon=True,
        ).start()

    # -- Start node watchdog ----------------------------------------------------
    threading.Thread(
        target=_node_watchdog, args=(stop_evt,),
        name="NodeWatchdog", daemon=True,
    ).start()

    print(f"[server] Dashboard -> http://localhost:{args.port}")
    print(f"[server] LAN access -> http://<this-device-ip>:{args.port}")

    try:
        # threaded=True: each SSE client and each API call gets a thread
        # use_reloader=False: reloader double-forks and breaks background threads
        app.run(
            host=args.host,
            port=args.port,
            threaded=True,
            debug=False,
            use_reloader=False,
        )
    finally:
        stop_evt.set()
        print("[server] Shutdown complete.")


if __name__ == "__main__":
    main()