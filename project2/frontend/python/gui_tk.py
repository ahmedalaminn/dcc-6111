"""
gui_tk.py
---------
Tkinter dashboard for the SLB Distributed Pubsub Network Logger.

Lightweight, BBB-friendly: stdlib only (tkinter + urllib). No GPU/OpenGL.
Compatible with Python 3.7+ (Debian 10 Buster on BeagleBone Black).
Consumes the existing backend API: GET /stream (SSE), POST /toggle.

Nodes have unique IDs (from the backend). Use "Search node ID" to filter
the node list and log table by partial match on node ID.

Layout
------
  ┌─────────────────────────────────────────────────────────────┐
  │  SLB Network Logger              Local Node: ● OK          │
  │  Diagnostic Logging  [ ON ]   Search node ID: [________]   │
  ├──────────────────┬──────────────────────────────────────────┤
  │ Network Overview  │ Live Diagnostic Log                      │
  │  ● node-1   OK    │  Timestamp   | Producer  | Payload       │
  │  ● node-2   OK    │  ...        | ...       | ...           │
  │  ○ node-3   LOST  │                                          │
  └──────────────────┴──────────────────────────────────────────┘
"""

import json
import queue
import threading
import time
from datetime import datetime
from typing import Dict, Optional, Tuple
from urllib import request as urllib_request
from urllib.error import URLError

import tkinter as tk
from tkinter import ttk

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_NODES = 5
MAX_LOG_ROWS = 200
NODE_TIMEOUT_S = 10.0
SSE_RECONNECT_DELAY_S = 5.0
POLL_QUEUE_MS = 100
# ─────────────────────────────────────────────────────────────────────────────


def _parse_sse_line(line: str) -> Optional[Tuple[str, dict]]:
    """Parse one SSE line; return (event_type, data) or None."""
    line = line.strip()
    if line.startswith("event:"):
        return ("_event", {"type": line[6:].strip()})
    if line.startswith("data:"):
        try:
            return ("_data", json.loads(line[5:].strip()))
        except json.JSONDecodeError:
            return None
    return None


def sse_thread_loop(
    base_url: str,
    out_queue: queue.Queue,
    stop_evt: threading.Event,
) -> None:
    """
    Background thread: connect to GET {base_url}/stream, parse SSE,
    push ("log", {...}) or ("node_status", {...}) into out_queue.
    Reconnects on disconnect.
    """
    url = base_url.rstrip("/") + "/stream"
    current_event: Optional[str] = None
    current_data: Optional[dict] = None

    while not stop_evt.is_set():
        try:
            req = urllib_request.Request(url)
            with urllib_request.urlopen(req, timeout=30) as resp:
                # Read SSE stream line by line
                buf = b""
                while not stop_evt.is_set():
                    chunk = resp.read(1)
                    if not chunk:
                        break
                    buf += chunk
                    if buf.endswith(b"\n"):
                        line = buf.decode("utf-8", errors="replace")
                        buf = b""
                        parsed = _parse_sse_line(line)
                        if parsed:
                            kind, data = parsed
                            if kind == "_event":
                                current_event = data.get("type")
                                current_data = None
                            elif kind == "_data" and current_event:
                                current_data = data
                                if current_event == "log":
                                    out_queue.put(("log", current_data))
                                elif current_event == "node_status":
                                    out_queue.put(("node_status", current_data))
                                current_event = None
        except (URLError, OSError) as e:
            out_queue.put(("_error", {"message": str(e)}))
        except Exception as e:
            out_queue.put(("_error", {"message": str(e)}))
        if stop_evt.is_set():
            break
        stop_evt.wait(SSE_RECONNECT_DELAY_S)


def http_post_json(base_url: str, path: str, data: dict) -> Optional[dict]:
    """POST JSON to base_url + path; return response JSON or None."""
    url = base_url.rstrip("/") + path
    try:
        payload = json.dumps(data).encode("utf-8")
        req = urllib_request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib_request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


class DashboardTk:
    """
    Tkinter dashboard: connects to backend via SSE, shows nodes and log,
    toggle for diagnostic logging. Thread-safe updates via queue.
    """

    def __init__(self, base_url: str = "http://127.0.0.1:5000") -> None:
        self._base_url = base_url
        self._queue: queue.Queue = queue.Queue()
        self._logging_enabled = True
        self._node_last_seen: Dict[str, float] = {}
        self._node_status: Dict[str, str] = {}  # node_id -> "ok" | "lost"
        self._log_data: list = []  # list of (ts, node_id, payload) for filtering
        self._stop_evt = threading.Event()

        self._root = tk.Tk()
        self._root.title("SLB Network Logger")
        self._root.minsize(700, 400)
        self._root.geometry("920x520")

        self._build_ui()
        self._start_sse_thread()
        self._poll_queue()

    def _build_ui(self) -> None:
        main = ttk.Frame(self._root)
        main.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        # Header
        header = ttk.Frame(main)
        header.pack(fill=tk.X, pady=(0, 8))
        ttk.Label(header, text="SLB Network Logger", font=("TkDefaultFont", 12, "bold")).pack(side=tk.LEFT)
        self._local_label = ttk.Label(header, text="Local Node: ● OK")
        self._local_label.pack(side=tk.RIGHT, padx=8)

        # Diagnostic toggle
        row_toggle = ttk.Frame(main)
        row_toggle.pack(fill=tk.X, pady=(0, 8))
        ttk.Label(row_toggle, text="Diagnostic Logging").pack(side=tk.LEFT, padx=(0, 8))
        self._toggle_var = tk.BooleanVar(value=True)
        self._toggle_btn = ttk.Checkbutton(
            row_toggle,
            variable=self._toggle_var,
            command=self._on_toggle,
        )
        self._toggle_btn.pack(side=tk.LEFT)
        self._toggle_label = ttk.Label(row_toggle, text="ON")
        self._toggle_label.pack(side=tk.LEFT, padx=8)

        # Search node ID (filters node list and log table)
        row_search = ttk.Frame(main)
        row_search.pack(fill=tk.X, pady=(0, 8))
        ttk.Label(row_search, text="Search node ID:").pack(side=tk.LEFT, padx=(0, 6))
        self._search_var = tk.StringVar()
        self._search_var.trace("w", lambda *a: self._on_search())
        search_entry = ttk.Entry(row_search, textvariable=self._search_var, width=24)
        search_entry.pack(side=tk.LEFT)
        ttk.Label(row_search, text="(partial match, clear to show all)", foreground="gray").pack(side=tk.LEFT, padx=6)

        # Two panels
        paned = ttk.PanedWindow(main, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)

        # Left: Network Overview (no padding= on LabelFrame for Python 3.7)
        left = ttk.LabelFrame(paned, text="Network Overview")
        paned.add(left, weight=0)
        self._nodes_frame = ttk.Frame(left)
        self._nodes_frame.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)
        self._nodes_empty = ttk.Label(left, text="No nodes seen yet.", foreground="gray")
        self._nodes_empty.pack(anchor=tk.W)
        self._node_widgets: Dict[str, Tuple[ttk.Label, ttk.Label]] = {}

        # Right: Live Diagnostic Log
        right = ttk.LabelFrame(paned, text="Live Diagnostic Log")
        paned.add(right, weight=1)
        right_inner = ttk.Frame(right)
        right_inner.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)
        cols = ("Timestamp", "Producer ID", "Payload")
        self._tree = ttk.Treeview(right_inner, columns=cols, show="headings", height=18)
        for c in cols:
            self._tree.heading(c, text=c)
        self._tree.column("Timestamp", width=120, minwidth=100)
        self._tree.column("Producer ID", width=120, minwidth=80)
        self._tree.column("Payload", width=400, minwidth=200)
        scroll = ttk.Scrollbar(right_inner, orient=tk.VERTICAL, command=self._tree.yview)
        self._tree.configure(yscrollcommand=scroll.set)
        self._tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)

        # Message count
        self._count_label = ttk.Label(main, text="Messages: 0 (showing 0)")
        self._count_label.pack(anchor=tk.W, pady=(4, 0))

        self._root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._refresh_log_display()

    def _on_toggle(self) -> None:
        self._logging_enabled = self._toggle_var.get()
        self._toggle_label.config(text="ON" if self._logging_enabled else "OFF")
        resp = http_post_json(self._base_url, "/toggle", {"enabled": self._logging_enabled})
        if resp is None:
            self._toggle_label.config(text="ON (sync failed)" if self._logging_enabled else "OFF (sync failed)")

    def _on_search(self) -> None:
        """Refilter node list and log table by current search string."""
        self._refresh_node_display()
        self._refresh_log_display()

    def _on_close(self) -> None:
        self._stop_evt.set()
        self._root.quit()
        self._root.destroy()

    def _start_sse_thread(self) -> None:
        t = threading.Thread(
            target=sse_thread_loop,
            args=(self._base_url, self._queue, self._stop_evt),
            daemon=True,
        )
        t.start()

    def _poll_queue(self) -> None:
        """Drain queue and apply updates (run on main thread)."""
        try:
            while True:
                kind, data = self._queue.get_nowait()
                if kind == "log":
                    self._append_log(data)
                elif kind == "node_status":
                    self._update_node_status(data)
                elif kind == "_error":
                    self._count_label.config(text=f"Connection error: {data.get('message', '')[:40]}")
        except queue.Empty:
            pass
        self._refresh_node_display()
        if not self._stop_evt.is_set():
            self._root.after(POLL_QUEUE_MS, self._poll_queue)

    def _update_node_status(self, data: dict) -> None:
        node_id = data.get("node_id", "")
        status = data.get("status", "ok")
        if node_id:
            self._node_last_seen[node_id] = time.time()
            self._node_status[node_id] = status

    def _append_log(self, data: dict) -> None:
        if not self._logging_enabled:
            return
        ts = data.get("ts", "")
        node_id = data.get("node_id", "")
        payload = data.get("payload", "")
        topic = data.get("topic", "")
        if topic:
            payload = "[{}] {}".format(topic, payload)
        self._log_data.append((ts, node_id, payload))
        while len(self._log_data) > MAX_LOG_ROWS:
            self._log_data.pop(0)
        if node_id:
            self._node_last_seen[node_id] = time.time()
            if node_id not in self._node_status:
                self._node_status[node_id] = "ok"
        self._refresh_log_display()

    def _refresh_log_display(self) -> None:
        """Repopulate log tree from _log_data, applying search filter by node ID."""
        search = self._search_var.get().strip().lower()
        for iid in self._tree.get_children():
            self._tree.delete(iid)
        shown = 0
        for (ts, node_id, payload) in self._log_data:
            if search and search not in node_id.lower():
                continue
            self._tree.insert("", tk.END, values=(ts, node_id, payload))
            shown += 1
        self._count_label.config(text="Messages: {} (showing {})".format(len(self._log_data), shown))

    def _refresh_node_display(self) -> None:
        now = time.time()
        # Timeout any node not seen recently
        for nid in list(self._node_last_seen.keys()):
            if (now - self._node_last_seen[nid]) > NODE_TIMEOUT_S:
                self._node_status[nid] = "lost"

        # Cap at MAX_NODES; show in stable order; filter by search if set
        order = sorted(self._node_last_seen.keys())[:MAX_NODES]
        search = self._search_var.get().strip().lower()
        if search:
            order = [nid for nid in order if search in nid.lower()]
        if not order:
            if search and self._node_last_seen:
                self._nodes_empty.config(text="No nodes match search.")
            else:
                self._nodes_empty.config(text="No nodes seen yet.")
            self._nodes_empty.pack(anchor=tk.W)
            for nid, (dot_lbl, status_lbl) in list(self._node_widgets.items()):
                dot_lbl.master.destroy()
            self._node_widgets.clear()
            return

        self._nodes_empty.pack_forget()
        for nid in order:
            status = self._node_status.get(nid, "ok")
            if nid not in self._node_widgets:
                row = ttk.Frame(self._nodes_frame)
                row.pack(fill=tk.X, pady=2)
                dot_lbl = ttk.Label(row, text="●" if status == "ok" else "○")
                dot_lbl.pack(side=tk.LEFT, padx=(0, 4))
                ttk.Label(row, text=nid).pack(side=tk.LEFT, padx=(0, 4))
                status_lbl = ttk.Label(row, text=status.upper())
                status_lbl.pack(side=tk.LEFT)
                self._node_widgets[nid] = (dot_lbl, status_lbl)
            else:
                dot_lbl, status_lbl = self._node_widgets[nid]
                dot_lbl.config(text="●" if status == "ok" else "○")
                status_lbl.config(text=status.upper())

        # Remove widgets for nodes that dropped off
        for nid in list(self._node_widgets.keys()):
            if nid not in order:
                dot_lbl, status_lbl = self._node_widgets.pop(nid)
                dot_lbl.master.destroy()

    def run(self) -> None:
        self._root.mainloop()


def main() -> None:
    import argparse
    p = argparse.ArgumentParser(description="SLB PubSub Logger — Tkinter UI (BBB-friendly)")
    p.add_argument(
        "--url",
        default="http://127.0.0.1:5000",
        help="Backend base URL (default: http://127.0.0.1:5000)",
    )
    args = p.parse_args()
    app = DashboardTk(base_url=args.url)
    app.run()


if __name__ == "__main__":
    main()
