import os
import sys

# Make sure the project root is importable when running as `python app/main.py`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.api.routes import create_app

if __name__ == "__main__":
    app = create_app()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    print(f"Waveform Monitor running at http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)
