"""FastAPI entry point for the VRAM calculator backend.

The Vite frontend calls `/api/report` for display-ready JSON, while `/` serves the
static fallback page for simple local viewing without a JavaScript toolchain.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse

from web.api import report_payload
from web.form_query import form_from_query
from web.page import render_page

app = FastAPI(title="AI Deployment Calculator")


@app.get("/api/report")
def report(request: Request) -> JSONResponse:
    """Return the display-ready deployment payload for the request query string."""
    return JSONResponse(report_payload(request.url.query))


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    """Serve the fallback one-page calculator."""
    return HTMLResponse(render_page(form_from_query(request.url.query)))
