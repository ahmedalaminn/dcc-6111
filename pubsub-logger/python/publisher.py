import argparse
import time

import zmq

from proto.log_message_pb2 import LogMessage

DEFAULT_ENDPOINT = "tcp://127.0.0.1:5556"
DEFAULT_INTERVAL_S = 2.0
DEFAULT_TOPIC = "diag"
DEFAULT_SNDHWM = 100


def run_publisher(
    node_id: str,
    endpoint: str,
    interval_s: float,
    topic: str,
    count: int,
    payload_template: str,
) -> None:
    context = zmq.Context(io_threads=1)
    pub = context.socket(zmq.PUB)
    pub.setsockopt(zmq.SNDHWM, DEFAULT_SNDHWM)
    pub.setsockopt(zmq.LINGER, 0)
    pub.connect(endpoint)

    sent = 0
    topic_bytes = topic.encode("utf-8")

    print(f"[{node_id}] Connecting to broker publisher port at {endpoint}")

    # Give the PUB socket a moment to establish before the first send.
    time.sleep(0.25)

    try:
        while count <= 0 or sent < count:
            msg = LogMessage(
                node_id=node_id,
                timestamp_ms=int(time.time() * 1000),
                payload=payload_template.format(node_id=node_id, seq=sent + 1),
                topic=topic,
            )
            pub.send_multipart([topic_bytes, msg.SerializeToString()])
            sent += 1
            print(f"[{node_id}] Message {sent} sent on topic '{topic}'.")
            time.sleep(interval_s)
    except KeyboardInterrupt:
        print(f"\n[{node_id}] Publisher interrupted after {sent} messages.")
    finally:
        pub.close()
        context.term()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Publish simulated diagnostic messages to the SLB logger broker."
    )
    parser.add_argument("node_id", nargs="?", default="node-1")
    parser.add_argument(
        "--endpoint",
        default=DEFAULT_ENDPOINT,
        help=f"Broker XSUB endpoint to publish into (default: {DEFAULT_ENDPOINT})",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_S,
        help=f"Seconds between messages (default: {DEFAULT_INTERVAL_S})",
    )
    parser.add_argument(
        "--topic",
        default=DEFAULT_TOPIC,
        help=f"Topic label to publish (default: {DEFAULT_TOPIC})",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=0,
        help="Number of messages to send, or 0 to run continuously (default: 0)",
    )
    parser.add_argument(
        "--payload-template",
        default="Diagnostic telemetry from {node_id} [sample {seq}]",
        help="Python format string used to build each payload.",
    )
    args = parser.parse_args()

    run_publisher(
        node_id=args.node_id,
        endpoint=args.endpoint,
        interval_s=args.interval,
        topic=args.topic,
        count=args.count,
        payload_template=args.payload_template,
    )


if __name__ == "__main__":
    main()
