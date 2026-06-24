from __future__ import annotations

from fastapi.testclient import TestClient

from web.server import app

client = TestClient(app)

QUERY = "parameters_b=70&context_tokens=8000&weight_bits=4&kv_cache_bits=8&trained=on&use_adapter=on"


def test_report_endpoint_returns_payload() -> None:
    response = client.get(f"/api/report?{QUERY}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    payload = response.json()
    assert payload["total_vram"] == "48.4 GB"
    assert payload["host_ram"] == "64 GB host RAM"
    assert payload["plan"]["primary"] == "A100 80GB"
    assert payload["plan"]["primary_fit"] == "single GPU"
    assert payload["breakdown"][0] == {"label": "Weights", "value": "35.0 GB"}
    assert payload["comparison"][3]["selected"] is True


def test_index_serves_fallback_page() -> None:
    response = client.get(f"/?{QUERY}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<h2>QLoRA</h2>" in response.text
    assert "48.4 GB" in response.text
