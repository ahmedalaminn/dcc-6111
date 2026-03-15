"""
gui.py
------
Dear PyGui dashboard for the SLB Distributed PubSub Network Logger.

Layout
------
  ┌─────────────────────────────────────────────────┐
  │  SLB Network Logger          [● Local Node: OK] │
  │  Diagnostic Logging  [ ON ]                     │
  ├────────────────┬────────────────────────────────┤
  │ Network        │ Live Diagnostic Log             │
  │ Overview       │  Timestamp | Producer | Payload │
  │ node-1  ● OK   │  ...       | ...      | ...     │
  │ node-2  ● OK   │                                 │
  │ node-3  ○ LOST │                                 │
  └────────────────┴────────────────────────────────┘
"""

import queue
import time
from datetime import datetime
from typing import Dict

import dearpygui.dearpygui as dpg

from proto.log_message_pb2 import LogMessage

# ── constants ─────────────────────────────────────────────────────────────────
MAX_NODES       = 5
MAX_LOG_ROWS    = 200          # keep table bounded (memory)
NODE_TIMEOUT_S  = 10.0         # seconds before a node is marked LOST
POLL_INTERVAL_S = 0.05         # GUI update loop cadence (~20 fps)
WIN_W, WIN_H    = 900, 560     # initial window size
# ─────────────────────────────────────────────────────────────────────────────

# Colours (RGBA 0-255)
COL_GREEN  = (80, 200, 120, 255)
COL_RED    = (220, 60,  60,  255)
COL_YELLOW = (240, 180, 40,  255)
COL_GREY   = (140, 140, 140, 255)
COL_BG     = (22,  27,  34,  255)
COL_PANEL  = (30,  36,  45,  255)


# ═══════════════════════════════════════════════════════════════════════════════
class Dashboard:
    """
    Owns all DearPyGui state and provides a `pump()` method that should be
    called on every render frame to drain the message queue and refresh widgets.
    """

    def __init__(self, msg_queue: queue.Queue) -> None:
        self._queue: queue.Queue      = msg_queue
        self._logging_enabled: bool   = True
        self._local_node_ok:   bool   = True

        # node_id → last-seen epoch float
        self._node_last_seen: Dict[str, float] = {}
        # node_id → (row_tag, status_tag)  for live editing
        self._node_rows:      Dict[str, tuple]  = {}

        # log table row tags (circular eviction)
        self._log_row_tags:    list = []
        self._log_row_counter: int  = 0  # monotonically increasing — avoids tag collisions

        self._build_ui()

    # ── UI construction ────────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        dpg.create_context()
        dpg.create_viewport(
            title="SLB Network Logger",
            width=WIN_W, height=WIN_H,
            min_width=700, min_height=400,
        )
        self._apply_theme()
        dpg.setup_dearpygui()

        with dpg.window(tag="main_win", no_title_bar=True,
                        no_resize=True, no_move=True, no_close=True):

            # ── Header bar ────────────────────────────────────────────────────
            with dpg.group(horizontal=True):
                dpg.add_text("SLB Network Logger", color=(200, 210, 255, 255))
                dpg.add_spacer(width=20)
                dpg.add_text("●", tag="local_node_dot", color=COL_GREEN)
                dpg.add_text("Local Node:", color=COL_GREY)
                dpg.add_text("OK", tag="local_node_status", color=COL_GREEN)

            dpg.add_separator()

            # ── Logging toggle ────────────────────────────────────────────────
            with dpg.group(horizontal=True):
                dpg.add_text("Diagnostic Logging", color=COL_GREY)
                dpg.add_spacer(width=8)
                dpg.add_checkbox(
                    tag="logging_toggle",
                    default_value=True,
                    callback=self._on_toggle_logging,
                )
                dpg.add_text("ON", tag="logging_label", color=COL_GREEN)

            dpg.add_spacer(height=6)

            # ── Two-column body ───────────────────────────────────────────────
            with dpg.group(horizontal=True):

                # Left: Network Overview
                with dpg.child_window(tag="panel_nodes", width=220,
                                      border=True, height=-1):
                    dpg.add_text("Network Overview", color=(180, 190, 255, 255))
                    dpg.add_separator()
                    dpg.add_text("No nodes seen yet.",
                                 tag="nodes_empty_hint", color=COL_GREY)

                dpg.add_spacer(width=6)

                # Right: Live Diagnostic Log
                with dpg.child_window(tag="panel_log", border=True,
                                      height=-1, horizontal_scrollbar=False):
                    dpg.add_text("Live Diagnostic Log",
                                 color=(180, 190, 255, 255))
                    dpg.add_separator()

                    with dpg.table(
                        tag="log_table",
                        header_row=True,
                        borders_innerH=True,
                        borders_outerH=True,
                        borders_innerV=True,
                        borders_outerV=True,
                        scrollY=True,
                        freeze_rows=1,
                        policy=dpg.mvTable_SizingStretchProp,
                        height=-1,
                    ):
                        dpg.add_table_column(label="Timestamp",   width_fixed=True,
                                             init_width_or_weight=160)
                        dpg.add_table_column(label="Producer ID", width_fixed=True,
                                             init_width_or_weight=120)
                        dpg.add_table_column(label="Payload")

        dpg.set_primary_window("main_win", True)

    # ── Theme ──────────────────────────────────────────────────────────────────

    def _apply_theme(self) -> None:
        with dpg.theme() as global_theme:
            with dpg.theme_component(dpg.mvAll):
                dpg.add_theme_color(dpg.mvThemeCol_WindowBg,  COL_BG,    category=dpg.mvThemeCat_Core)
                dpg.add_theme_color(dpg.mvThemeCol_ChildBg,   COL_PANEL, category=dpg.mvThemeCat_Core)
                dpg.add_theme_color(dpg.mvThemeCol_TableHeaderBg,
                                    (40, 48, 60, 255), category=dpg.mvThemeCat_Core)
                dpg.add_theme_color(dpg.mvThemeCol_FrameBg,
                                    (50, 58, 72, 255), category=dpg.mvThemeCat_Core)
                dpg.add_theme_style(dpg.mvStyleVar_WindowRounding, 4,
                                    category=dpg.mvThemeCat_Core)
                dpg.add_theme_style(dpg.mvStyleVar_FrameRounding,  4,
                                    category=dpg.mvThemeCat_Core)
        dpg.bind_theme(global_theme)

    # ── Callbacks ──────────────────────────────────────────────────────────────

    def _on_toggle_logging(self, sender, app_data) -> None:
        self._logging_enabled = app_data
        if app_data:
            dpg.set_value("logging_label", "ON")
            dpg.configure_item("logging_label", color=COL_GREEN)
        else:
            dpg.set_value("logging_label", "OFF")
            dpg.configure_item("logging_label", color=COL_RED)

    # ── Per-frame update ───────────────────────────────────────────────────────

    def pump(self) -> None:
        """Drain the message queue and refresh all widgets. Call once per frame."""
        now = time.time()

        # Drain queue
        while True:
            try:
                msg: LogMessage = self._queue.get_nowait()
            except queue.Empty:
                break

            self._update_node(msg.node_id, now)
            if self._logging_enabled:
                self._append_log_row(msg)

        # Refresh node statuses (detect timeouts)
        self._refresh_node_statuses(now)

    # ── Node panel ─────────────────────────────────────────────────────────────

    def _update_node(self, node_id: str, now: float) -> None:
        self._node_last_seen[node_id] = now

        if node_id not in self._node_rows:
            if len(self._node_rows) >= MAX_NODES:
                return  # cap at MAX_NODES

            # Hide the "no nodes" hint
            if dpg.does_item_exist("nodes_empty_hint"):
                dpg.configure_item("nodes_empty_hint", show=False)

            dot_tag    = f"nd_{node_id}_dot"
            status_tag = f"nd_{node_id}_status"

            with dpg.group(horizontal=True, parent="panel_nodes"):
                dpg.add_text("●", tag=dot_tag,    color=COL_GREEN)
                dpg.add_text(node_id, color=(210, 215, 230, 255))
                dpg.add_spacer(width=4)
                dpg.add_text("OK", tag=status_tag, color=COL_GREEN)

            self._node_rows[node_id] = (dot_tag, status_tag)

    def _refresh_node_statuses(self, now: float) -> None:
        for node_id, (dot_tag, status_tag) in self._node_rows.items():
            elapsed = now - self._node_last_seen.get(node_id, 0)
            if elapsed > NODE_TIMEOUT_S:
                dpg.configure_item(dot_tag,    color=COL_RED)
                dpg.configure_item(status_tag, color=COL_RED)
                dpg.set_value(status_tag, "LOST")
            else:
                dpg.configure_item(dot_tag,    color=COL_GREEN)
                dpg.configure_item(status_tag, color=COL_GREEN)
                dpg.set_value(status_tag, "OK")

    # ── Log table ──────────────────────────────────────────────────────────────

    def _append_log_row(self, msg: LogMessage) -> None:
        ts = datetime.fromtimestamp(msg.timestamp_ms / 1000).strftime("%H:%M:%S.%f")[:-3]

        row_tag = f"row_{self._log_row_counter}"
        self._log_row_counter += 1

        with dpg.table_row(parent="log_table", tag=row_tag):
            dpg.add_text(ts,           color=COL_GREY)
            dpg.add_text(msg.node_id,  color=COL_YELLOW)
            dpg.add_text(msg.payload)

        self._log_row_tags.append(row_tag)

        # Evict oldest row if over limit
        if len(self._log_row_tags) > MAX_LOG_ROWS:
            oldest = self._log_row_tags.pop(0)
            if dpg.does_item_exist(oldest):
                dpg.delete_item(oldest)

    # ── Viewport size sync ─────────────────────────────────────────────────────

    def sync_viewport(self) -> None:
        w = dpg.get_viewport_client_width()
        h = dpg.get_viewport_client_height()
        dpg.set_item_width("main_win",  w)
        dpg.set_item_height("main_win", h)
