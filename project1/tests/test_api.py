"""API-level checks for raw-metric fallback and report deletion."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.api.routes import create_app


def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


def test_metrics_history_falls_back_to_raw_data():
    res = client().get("/api/sources/sourceA/metrics")
    assert res.status_code == 200

    payload = res.get_json()
    assert payload["source"] == "sourceA"
    assert len(payload["metrics"]) >= 1
    assert payload["metrics"][0]["filename"].endswith(".bin")


def test_waveform_endpoint_includes_metrics():
    res = client().get("/api/sources/sourceA/waveforms/capture_001.bin?max_points=1000")
    assert res.status_code == 200

    payload = res.get_json()
    assert payload["filename"] == "capture_001.bin"
    assert "metrics" in payload
    assert "rms" in payload["metrics"]
    assert "dominant_freq_hz" in payload["metrics"]


def test_report_generate_and_delete_roundtrip():
    test_client = client()

    gen = test_client.post("/api/reports/generate", json={"source_id": "sourceA"})
    assert gen.status_code == 200
    report_name = gen.get_json()["report"]

    try:
        fetch = test_client.get(f"/api/reports/{report_name}")
        assert fetch.status_code == 200
        html = fetch.get_data(as_text=True)
        assert "#0014dc" in html

        delete = test_client.delete(f"/api/reports/{report_name}")
        assert delete.status_code == 200
        assert delete.get_json()["deleted"] == report_name

        missing = test_client.get(f"/api/reports/{report_name}")
        assert missing.status_code == 404
    finally:
        report_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data",
            "reports",
            report_name,
        )
        if os.path.exists(report_path):
            os.remove(report_path)
