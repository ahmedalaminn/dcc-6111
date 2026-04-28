import argparse

import zmq

DEFAULT_XPUB_BIND = "tcp://0.0.0.0:5555"
DEFAULT_XSUB_BIND = "tcp://0.0.0.0:5556"
DEFAULT_HWM = 200


def _configure_socket(sock: zmq.Socket, hwm: int) -> None:
    sock.setsockopt(zmq.SNDHWM, hwm)
    sock.setsockopt(zmq.RCVHWM, hwm)
    sock.setsockopt(zmq.LINGER, 0)


def run_broker(xpub_bind: str, xsub_bind: str, hwm: int) -> None:
    context = zmq.Context(io_threads=1)

    xpub = context.socket(zmq.XPUB)
    xsub = context.socket(zmq.XSUB)
    _configure_socket(xpub, hwm)
    _configure_socket(xsub, hwm)

    xpub.bind(xpub_bind)
    xsub.bind(xsub_bind)
    print(f"[broker] XPUB listening on {xpub_bind}")
    print(f"[broker] XSUB listening on {xsub_bind}")
    print(f"[broker] High-water mark per socket: {hwm}")

    try:
        zmq.proxy(xsub, xpub)
    except KeyboardInterrupt:
        print("\n[broker] Shutdown requested.")
    finally:
        xpub.close()
        xsub.close()
        context.term()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SLB ZeroMQ XPUB/XSUB broker for the node logger."
    )
    parser.add_argument(
        "--xpub-bind",
        default=DEFAULT_XPUB_BIND,
        help=f"Subscriber-facing bind endpoint (default: {DEFAULT_XPUB_BIND})",
    )
    parser.add_argument(
        "--xsub-bind",
        default=DEFAULT_XSUB_BIND,
        help=f"Publisher-facing bind endpoint (default: {DEFAULT_XSUB_BIND})",
    )
    parser.add_argument(
        "--hwm",
        type=int,
        default=DEFAULT_HWM,
        help=f"ZeroMQ high-water mark per socket (default: {DEFAULT_HWM})",
    )
    args = parser.parse_args()
    run_broker(args.xpub_bind, args.xsub_bind, args.hwm)


if __name__ == "__main__":
    main()
