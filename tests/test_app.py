from __future__ import annotations

from collections.abc import Callable

from web.app import application


def test_wsgi_application_serves_submitted_form() -> None:
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
            {"QUERY_STRING": "parameters_b=70&context_tokens=8000&weight_bits=4&trained=on&use_adapter=on"},
            start_response,
        )
    ).decode("utf-8")

    assert response["status"] == "200 OK"
    headers = response["headers"]
    assert isinstance(headers, list)
    assert ("Content-Type", "text/html; charset=utf-8") in headers
    assert "<h2>QLoRA</h2>" in body
    assert "52.3 GB" in body
