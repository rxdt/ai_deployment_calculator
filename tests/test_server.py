from __future__ import annotations

from pathlib import Path

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


def test_index_serves_configured_frontend_build(tmp_path: Path) -> None:
    """The app factory serves the index path it was configured with."""
    dist = tmp_path / "dist"
    dist.mkdir()
    index_path = dist / "index.html"
    index_path.write_text('<div id="app"></div><script src="/assets/app.js"></script>', encoding="utf-8")
    built_app_client = TestClient(web.server.create_app(index_path=index_path, asset_dir=dist / "assets"))

    response = built_app_client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert '<div id="app"></div>' in response.text


def test_assets_served_from_dist() -> None:
    index_html = web.server.DIST_INDEX.read_text(encoding="utf-8")
    asset_path = index_html.split('src="', 1)[1].split('"', 1)[0]

    response = client.get(asset_path)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/javascript") or response.headers[
        "content-type"
    ].startswith("application/javascript")


def test_app_can_start_before_frontend_assets_are_built(tmp_path: Path) -> None:
    missing_assets_app = web.server.create_app(asset_dir=tmp_path / "dist" / "assets")
    missing_assets_client = TestClient(missing_assets_app)

    report_response = missing_assets_client.get(f"/api/report?{QUERY}")
    asset_response = missing_assets_client.get("/assets/app.js")

    assert report_response.status_code == 200
    assert asset_response.status_code == 404


def test_index_falls_back_to_no_js_page_without_build(tmp_path: Path) -> None:
    """A missing configured index keeps the no-JS fallback available."""
    fallback_client = TestClient(web.server.create_app(index_path=tmp_path / "missing.html"))

    response = fallback_client.get(f"/?{QUERY}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<h2>QLoRA</h2>" in response.text
    assert "48.4 GB" in response.text
