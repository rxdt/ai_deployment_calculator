# AI Deployment Calculator

A small web app for estimating AI model deployment memory. It reports GPU VRAM,
host RAM, a hardware fit table, a primary deployment plan, quantization
comparison, and the assumptions behind the estimate.

## Current Launch State

- The Vite frontend lives in `frontend/`.
- The FastAPI backend lives in `src/web/server.py`.
- The active finish spec is `specs/frontend.md`.
- FastAPI serves the built Vite app at `/`, mounts `/assets`, and falls back to
  the no-JS page only when no `frontend/dist` build exists. There is no WSGI
  server.

## Start Manually

FastAPI backend:

```sh
uv run uvicorn --app-dir src web.server:app --host 127.0.0.1 --port 8000
```

Frontend dev server:

```sh
cd frontend
npm ci
npm run dev -- --port 5173
```

Open the Vite dev app at `http://127.0.0.1:5173`. It proxies `/api/report` to
the FastAPI backend on port 8000.

After `cd frontend && npm run build`, FastAPI serves the built Vite app directly
at `http://127.0.0.1:8000`. Without a build it renders the no-JS fallback page.

## Test Manually

1. Open the Vite app.
2. Set parameters to `70`, context to `8000`, quantization to `4-bit`, KV cache
   to `8-bit`, and enable model training plus LoRA adapter.
3. Calculate.
4. Confirm the result shows `48.4 GB`, `64 GB host RAM`, and primary hardware
   `A100 80GB`.
5. Change runtime to `llama.cpp GGUF` and confirm the calculation text uses
   `* 1.00`.
6. Open the browser network panel and confirm `/api/report` returns JSON.

## App Checks

```sh
uv run pytest tests/test_api.py tests/test_server.py tests/test_frontend.py
cd frontend && npm run build
```

Browser e2e:

```sh
cd frontend && npm run test:e2e
```

If an agent cannot bind localhost or launch Chromium in its sandbox, rerun the
same command unsandboxed.

## Owner Notes

- `docs/plan.md` and `specs/frontend.md` are the launch handoff.
- `specs/frontend.md` is the only remaining spec.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
- Keep markdown files under 100 lines.
