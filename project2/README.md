# Project 2 — BBB Logger Runtime

This temp copy is tuned for the BeagleBone Black deployment path:

- the BBB runs the ZeroMQ broker and the Flask transcript dashboard
- a MacBook simulates node publishers and sends data into the BBB broker
- the dashboard is viewed in a browser, so the BBB does not need Node, React, or a local GUI stack

## Minimal runtime

Only the Python backend is required on the BBB:

- `python/broker.py`
- `python/server.py`
- `python/zmq_subscriber.py`
- `python/proto/log_message_pb2.py`
- `python/templates/index.html`

The protobuf binding is a lightweight local stub, so the runtime does not need the `protobuf` package.

## BBB dependencies

Preferred on-device install:

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-flask python3-zmq
```

Fallback pip install:

```bash
python3 -m pip install --no-cache-dir -r python/requirements-bbb.txt
```

## BBB run flow

On the BBB:

```bash
./run_bbb_broker.sh
./run_bbb_server.sh
```

The dashboard is then available at:

```text
http://<bbb-ip>:5000
```

## Mac node simulation

Run publishers from the Mac against the BBB XSUB port:

```bash
python3 python/publisher.py node-alpha --endpoint tcp://<bbb-ip>:5556
python3 python/publisher.py node-beta --endpoint tcp://<bbb-ip>:5556
```

Useful publisher options:

```bash
python3 python/publisher.py node-alpha --endpoint tcp://<bbb-ip>:5556 --interval 1 --count 20
python3 python/publisher.py node-beta --endpoint tcp://<bbb-ip>:5556 --payload-template "Mac simulator {node_id} sample {seq}"
```

## Is this a sufficient BBB test?

Yes. Running the broker and dashboard on the BBB while a Mac simulates publishers is a valid functional integration test for the intended deployment model.

It verifies:

- BBB-side broker binding and forwarding
- BBB-side subscriber ingestion
- BBB-side transcript rendering and logging toggle
- network transport from remote nodes into the BBB

It does not replace:

- long-duration soak testing
- load testing with higher publish rates
- validating real field nodes if they differ from the Mac simulator

## Optional React frontend

The Vite React app remains in this temp copy for laptop-only development, but it is not required for the BBB path and should not be installed on the BBB.
