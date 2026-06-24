from __future__ import annotations

import json
from collections.abc import Callable

from web.app import application


def call_application(
    query_string: str,
    path_info: str = "/",
) -> tuple[dict[str, str | list[tuple[str, str]]], str]:
    response: dict[str, str | list[tuple[str, str]]] = {}

    def start_response(
        status: str,
        headers: list[tuple[str, str]],
        exc_info: object | None = None,
    ) -> Callable[[bytes], object]:
        del exc_info
        response["status"] = status
        response["headers"] = headers

        def write(body_chunk: bytes) -> object:
            del body_chunk
            return None

        return write

    body = b"".join(
        application(
            {
                "PATH_INFO": path_info,
                "QUERY_STRING": query_string,
            },
            start_response,
        )
    ).decode("utf-8")

    return response, body


def test_wsgi_application_serves_submitted_form() -> None:
    response, body = call_application(
        "parameters_b=70&context_tokens=8000&weight_bits=4&kv_cache_bits=8&trained=on&use_adapter=on"
    )

    assert response["status"] == "200 OK"
    headers = response["headers"]
    assert isinstance(headers, list)
    assert ("Content-Type", "text/html; charset=utf-8") in headers
    assert "<h2>QLoRA</h2>" in body
    assert "48.4 GB" in body


def test_wsgi_application_serves_vite_report_api() -> None:
    response, body = call_application(
        "parameters_b=70&context_tokens=8000&weight_bits=4&kv_cache_bits=8&trained=on&use_adapter=on",
        "/api/report",
    )

    assert response["status"] == "200 OK"
    headers = response["headers"]
    assert isinstance(headers, list)
    assert ("Content-Type", "application/json; charset=utf-8") in headers
    payload = json.loads(body)
    assert payload["total_vram"] == "48.4 GB"
    assert payload["host_ram"] == "64 GB host RAM"
    assert payload["plan"]["primary"] == "A100 80GB"
    assert payload["plan"]["primary_fit"] == "single GPU"
    assert payload["breakdown"][0] == {"label": "Weights", "value": "35.0 GB"}
    assert payload["comparison"][3]["selected"] is True
