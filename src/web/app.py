"""Minimal stdlib WSGI entry point that serves the one-page VRAM calculator.

PRIORITY 3 of specs/vram_calculator.md wants a usable one-page web app, not just a render
function. This adapter reads the GET query string, rebuilds the form, and serves `render_page`,
so changing an input and submitting recomputes the deployment. Pure stdlib WSGI, no framework.
"""

from __future__ import annotations

from collections.abc import Iterable
from wsgiref.types import StartResponse, WSGIEnvironment

from web.page import render_page
from web.presenter import form_from_query


def application(environ: WSGIEnvironment, start_response: StartResponse) -> Iterable[bytes]:
    """Serve the one-page calculator, rendering the form submitted via the GET query string."""
    form = form_from_query(environ.get("QUERY_STRING", ""))
    body = render_page(form).encode("utf-8")
    headers = [
        ("Content-Type", "text/html; charset=utf-8"),
        ("Content-Length", str(len(body))),
    ]
    start_response("200 OK", headers)
    return [body]
