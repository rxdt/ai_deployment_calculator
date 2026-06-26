from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import web.server
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


def test_index_serves_built_vite_app() -> None:
    assert web.server.DIST_INDEX.is_file(), "build frontend/dist before launch"

    response = client.get(f"/?{QUERY}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert 'id="app"' in response.text
    assert "/assets/" in response.text


def test_assets_served_from_dist() -> None:
    index_html = web.server.DIST_INDEX.read_text(encoding="utf-8")
    asset_path = index_html.split('src="', 1)[1].split('"', 1)[0]

    response = client.get(asset_path)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/javascript") or response.headers[
        "content-type"
    ].startswith("application/javascript")


def test_index_falls_back_to_no_js_page_without_build(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(web.server, "DIST_INDEX", web.server.DIST_DIR / "missing.html")

    response = client.get(f"/?{QUERY}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<h2>QLoRA</h2>" in response.text
    assert "48.4 GB" in response.text
