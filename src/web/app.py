"""Minimal stdlib WSGI entry point for the VRAM calculator backend.

The Vite frontend calls `/api/report`, while `/` still serves the static fallback page for
simple local viewing without a JavaScript toolchain.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from wsgiref.types import StartResponse, WSGIEnvironment

from web.api import report_payload
from web.page import render_page
from web.presenter import form_from_query


def response(
    status: str,
    content_type: str,
    body_text: str,
    start_response: StartResponse,
) -> Iterable[bytes]:
    """Return a WSGI response with a concrete UTF-8 body."""
    body = body_text.encode("utf-8")
    headers = [
        ("Content-Type", content_type),
        ("Content-Length", str(len(body))),
    ]
    start_response(status, headers)
    return [body]


def application(environ: WSGIEnvironment, start_response: StartResponse) -> Iterable[bytes]:
    """Serve the report API and the fallback one-page calculator."""
    query_string = environ.get("QUERY_STRING", "")
    if environ.get("PATH_INFO") == "/api/report":
        return response(
            "200 OK",
            "application/json; charset=utf-8",
            json.dumps(report_payload(query_string)),
            start_response,
        )
    return response(
        "200 OK",
        "text/html; charset=utf-8",
        render_page(form_from_query(query_string)),
        start_response,
    )
