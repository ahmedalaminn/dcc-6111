# SLB Distributed PubSub Network Logger — Warp AI Context

## Project Summary
A local Python GUI application that subscribes to ZeroMQ messages from an
existing SLB backend and displays them as a real-time diagnostic dashboard.
No web server. No browser. Runs entirely on device.

---

## Target Hardware
| Property      | Value                                    |
|---------------|------------------------------------------|
| Device        | BeagleBone Black                         |
| CPU           | ARM Cortex-A8 @ 1 GHz (single-core)     |
| RAM           | 512 MB                                   |
| Storage       | 4 GB eMMC                                |
| OS            | Debian Linux (Bullseye or Bookworm)      |
| Display       | Connected via HDMI or DSI                |
| Python        | 3.10+                                    |

---

## Stack
| Layer         | Library           | Notes                                        |
|---------------|-------------------|----------------------------------------------|
| GUI           | **Dear PyGui**    | OpenGL-based immediate-mode UI (≥1.11.1)     |
| GUI fallback  | **Tkinter**       | Use if OpenGL/EGL is unavailable on the BBB  |
| Messaging     | **pyzmq**         | SUB socket; backend publishes on PUB socket  |
| Serialisation | **protobuf**      | `LogMessage` defined in `proto/log_message.proto` |
| Threading     | `threading`       | ZMQ runs in a daemon thread; GUI on main     |

---

## File Map
```
python/
├── main.py               # Entry point; arg parsing, thread wiring, render loop
├── gui.py                # Dashboard class (Dear PyGui widgets + per-frame pump)
├── zmq_subscriber.py     # ZmqSubscriber(threading.Thread) — daemon ZMQ reader
├── proto/
│   ├── log_message.proto # Protobuf schema (source of truth)
│   └── log_message_pb2.py# Generated bindings (stub dataclass until protoc runs)
└── requirements.txt      # pip dependencies
```

---

## Architecture — Key Patterns

### Thread model
```
Main thread          Daemon thread
──────────────       ──────────────────────────────
dpg render loop  ←── queue.Queue(maxsize=500) ←── ZmqSubscriber.run()
dashboard.pump()                                    (or DemoProducer in --demo mode)
```
- **Only** the main thread touches DearPyGui APIs.
- The subscriber thread only calls `queue.put_nowait()`.
- `dashboard.pump()` is called once per render frame to drain the queue.

### Message contract
```
ZMQ wire format: [topic_bytes : bytes, payload : bytes]
payload = LogMessage serialised via protobuf (or JSON stub)
```

### Node lifecycle
- A node appears in the Network Overview on first message received.
- A node is marked **LOST** (red) if no message received in `NODE_TIMEOUT_S` seconds (default 10).
- Maximum `MAX_NODES = 5` nodes tracked simultaneously.

### Log table eviction
- Maximum `MAX_LOG_ROWS = 200` rows kept in memory.
- Oldest row is deleted from the DPG item registry when the limit is exceeded.

---

## Running the App

```bash
# Standard (connects to backend)
python3 main.py --endpoint tcp://192.168.1.10:5555

# Demo mode (no backend required — generates synthetic data)
python3 main.py --demo

# Default endpoint (localhost:5555)
python3 main.py
```

---

## Dear PyGui Quick Reference

### Immediate-mode pattern
```python
import dearpygui.dearpygui as dpg

dpg.create_context()
dpg.create_viewport(title="App", width=900, height=560)
dpg.setup_dearpygui()

with dpg.window(tag="main"):
    dpg.add_text("Hello")

dpg.set_primary_window("main", True)
dpg.show_viewport()

while dpg.is_dearpygui_running():
    dpg.render_dearpygui_frame()

dpg.destroy_context()
```

### Updating a widget after creation
```python
dpg.set_value("my_text_tag", "new text")
dpg.configure_item("my_text_tag", color=(255, 0, 0, 255))
```

### Adding a table row at runtime
```python
with dpg.table_row(parent="my_table", tag="row_42"):
    dpg.add_text("cell 1")
    dpg.add_text("cell 2")
```

### Deleting an item
```python
if dpg.does_item_exist("row_0"):
    dpg.delete_item("row_0")
```

### Colours
Passed as `(R, G, B, A)` tuples with values 0–255.

---

## BeagleBone Black — Setup Notes

### Check OpenGL availability
```bash
glxinfo | grep "OpenGL version"   # needs mesa-utils
# or
eglinfo                            # for EGL/GLES path
```

### Install Dear PyGui (may need to build from source on ARM)
```bash
pip3 install dearpygui             # try binary wheel first
# If that fails, build from source:
# https://github.com/hoffstadt/DearPyGui/wiki/Building-on-Linux-ARM
```

### Tkinter fallback
If Dear PyGui cannot initialise OpenGL on the BBB, replace `gui.py` with a
Tkinter implementation that uses the same `queue.Queue` interface. The
`zmq_subscriber.py` and `main.py` wiring remain unchanged.

### Generate protobuf bindings
```bash
pip3 install grpcio-tools
python3 -m grpc_tools.protoc -I proto --python_out=proto proto/log_message.proto
# This replaces the stub proto/log_message_pb2.py with real generated code.
```

---

## Potential Next Steps
1. Add a settings panel (endpoint URL, topic filter) editable at runtime.
2. Persist the log to a local SQLite database using `sqlite3` (stdlib).
3. Add a Tkinter fallback GUI (`gui_tk.py`) selected automatically when
   Dear PyGui fails to initialise.
4. Replace the protobuf stub with real generated bindings once protoc is
   available on the target device.
