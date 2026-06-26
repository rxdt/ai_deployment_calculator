"""FastAPI entry point for the VRAM calculator backend.

The Vite frontend is the primary UI: when `frontend/dist` has been built, `/` serves
that single-page app and `/assets` serves its bundled JS/CSS. Without a build, `/`
falls back to the server-rendered no-JS page so the calculator still works. Either
way the SPA and the fallback both read `/api/report` from this same process.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from web.api import report_payload
from web.form_query import form_from_query
from web.page import render_page

DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
DIST_INDEX = DIST_DIR / "index.html"


def report(request: Request) -> JSONResponse:
    """Return the display-ready deployment payload for the request query string."""
    return JSONResponse(report_payload(request.url.query))


def index(request: Request) -> HTMLResponse | FileResponse:
    """Serve the built Vite app, or the no-JS fallback page when there is no build."""
    if DIST_INDEX.is_file():
        return FileResponse(DIST_INDEX)
    return HTMLResponse(render_page(form_from_query(request.url.query)))


def create_app(asset_dir: Path = DIST_DIR / "assets") -> FastAPI:
    """Build the FastAPI app without requiring frontend assets at import time."""
    application = FastAPI(title="AI Deployment Calculator")
    application.add_api_route("/api/report", report, methods=["GET"])
    application.add_api_route(
        "/",
        index,
        methods=["GET"],
        response_class=HTMLResponse,
        response_model=None,
    )
    if asset_dir.is_dir():
        application.mount("/assets", StaticFiles(directory=asset_dir), name="assets")
    return application


app = create_app()
