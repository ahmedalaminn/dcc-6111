# SLB Distributed PubSub Network Logger — BBB Runtime Context

## Project Summary

This temp project is now centered on the real BBB deployment path:

- `broker.py` runs the XPUB/XSUB ZeroMQ broker on the BBB
- `server.py` subscribes to the BBB broker and serves a lightweight Flask dashboard
- remote publishers, including a MacBook simulator, publish into the BBB over TCP

No local GUI toolkit is required on the BBB.

## Target Hardware

| Property | Value |
|----------|-------|
| Device | BeagleBone Black |
| CPU | ARM Cortex-A8 @ 1 GHz |
| RAM | 512 MB |
| Storage | 4 GB eMMC |
| Python | 3.7+ |

## Runtime Stack

| Layer | Library | Notes |
|------|---------|-------|
| Broker | `pyzmq` | XPUB/XSUB proxy |
| Dashboard server | `Flask` | Serves HTML + SSE |
| Subscriber | `pyzmq` + `threading` | Background queue bridge |
| Serialization | local `log_message_pb2.py` stub | No protobuf wheel required |
| Browser UI | plain HTML/CSS/JS | Viewed from Mac or another machine |

## File Map

```text
python/
├── broker.py              # ZeroMQ XPUB/XSUB broker
├── publisher.py           # Local or remote node simulator
├── server.py              # Flask dashboard + SSE stream
├── zmq_subscriber.py      # Background ZeroMQ subscriber
├── proto/
│   ├── log_message.proto
│   └── log_message_pb2.py # Lightweight JSON-backed stub
└── templates/index.html   # Browser dashboard
```

## Memory posture

- ZeroMQ context uses `io_threads=1`
- broker and subscriber sockets use bounded HWM settings
- the dashboard server uses bounded ingest and per-client queues
- the BBB does not need Node, npm, React, or a browser running locally

## Recommended test shape

This is the intended integration test:

1. Run `broker.py` on the BBB
2. Run `server.py` on the BBB
3. Open the dashboard from a Mac browser
4. Run one or more `publisher.py` processes on the Mac targeting the BBB XSUB port

That is sufficient to validate the product path for broker, ingest, and transcript display.
