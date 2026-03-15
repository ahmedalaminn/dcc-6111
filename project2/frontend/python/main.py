"""
main.py
-------
Entry point for the SLB Distributed PubSub Network Logger.

Run
---
    python3 main.py                       # connect to default endpoint
    python3 main.py --endpoint tcp://192.168.1.10:5555
    python3 main.py --demo                # run with synthetic demo data (no ZMQ needed)
"""

import argparse
import queue
import random
import sys
import threading
import time

import dearpygui.dearpygui as dpg

from gui import Dashboard, POLL_INTERVAL_S
from zmq_subscriber import ZmqSubscriber
from proto.log_message_pb2 import LogMessage

DEFAULT_ENDPOINT = "tcp://localhost:5555"
DEFAULT_TOPIC    = b""            # subscribe to everything


# ── Demo / synthetic data generator ───────────────────────────────────────────

def _demo_producer(out_queue: queue.Queue, stop_evt: threading.Event) -> None:
    """Injects fake LogMessage objects so the UI can be tested without a backend."""
    node_ids = [f"node-{i}" for i in range(1, 6)]
    payloads = [
        "heartbeat OK",
        "sensor_temp=72.3°C",
        "packet_loss=0.02%",
        "link_quality=98",
        "buffer_overflow WARNING",
        "reconnect attempt #1",
        "CRC_error on frame 0x3F",
    ]
    while not stop_evt.is_set():
        msg = LogMessage(
            node_id      = random.choice(node_ids),
            timestamp_ms = int(time.time() * 1000),
            payload      = random.choice(payloads),
            topic        = "diag",
        )
        try:
            out_queue.put_nowait(msg)
        except queue.Full:
            pass
        time.sleep(random.uniform(0.3, 1.2))


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="SLB PubSub Network Logger")
    parser.add_argument(
        "--endpoint", default=DEFAULT_ENDPOINT,
        help=f"ZeroMQ PUB endpoint (default: {DEFAULT_ENDPOINT})",
    )
    parser.add_argument(
        "--topic", default="",
        help="ZeroMQ subscription topic filter (default: all)",
    )
    parser.add_argument(
        "--demo", action="store_true",
        help="Run with synthetic demo data instead of a live ZMQ feed",
    )
    args = parser.parse_args()

    msg_queue = queue.Queue(maxsize=500)
    stop_evt  = threading.Event()

    # Start data source (demo thread or real ZMQ subscriber)
    if args.demo:
        print("[main] Demo mode — synthetic data enabled.")
        src_thread = threading.Thread(
            target=_demo_producer,
            args=(msg_queue, stop_evt),
            name="DemoProducer",
            daemon=True,
        )
        src_thread.start()
    else:
        subscriber = ZmqSubscriber(
            endpoint  = args.endpoint,
            topic     = args.topic.encode(),
            out_queue = msg_queue,
        )
        subscriber.start()

    # Build and run the GUI
    dashboard = Dashboard(msg_queue)
    dpg.show_viewport()

    try:
        while dpg.is_dearpygui_running():
            dashboard.pump()
            dashboard.sync_viewport()
            dpg.render_dearpygui_frame()
            time.sleep(POLL_INTERVAL_S)
    finally:
        stop_evt.set()
        dpg.destroy_context()
        print("[main] Shutdown complete.")


if __name__ == "__main__":
    main()
