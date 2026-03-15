"""
main_tk.py
----------
Entry point for the Tkinter frontend (BBB-friendly, no GPU).

The backend (Flask server with ZMQ or --demo) must be running separately.
This client connects to it via HTTP: GET /stream (SSE), POST /toggle.

Run
---
  # Terminal 1: start backend (e.g. demo mode)
  python3 server.py --demo

  # Terminal 2: start Tkinter UI
  python3 main_tk.py
  python3 main_tk.py --url http://192.168.1.10:5000   # backend on another host
"""

import argparse

from gui_tk import DashboardTk


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SLB PubSub Logger — Tkinter UI (BeagleBone Black friendly)"
    )
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:5000",
        help="Backend base URL (default: http://127.0.0.1:5000)",
    )
    args = parser.parse_args()
    app = DashboardTk(base_url=args.url)
    app.run()


if __name__ == "__main__":
    main()
