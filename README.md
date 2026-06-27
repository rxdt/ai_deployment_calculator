# AI Deployment Calculator

A small static web app for estimating AI model deployment memory. It reports GPU
VRAM, host RAM, a hardware fit table, a primary deployment plan, quantization
comparison, and the assumptions behind the estimate.

## Current Launch State

- The entire app is a static, single-page Vite app in `frontend/`.
- All sizing logic runs in TypeScript in the browser; there is no backend and no
  `/api/report` endpoint.
- The active finish spec is `specs/frontend.md`.

## Start Manually

```sh
cd frontend
npm ci
npm run dev -- --port 5173
```

Open the Vite dev app at `http://127.0.0.1:5173`. The report is computed locally
from the form state on each submit — no network request is made.

`cd frontend && npm run build` produces a static bundle in `frontend/dist/` that
can be served by any static file host (`npm run preview` serves it locally).

## Test Manually

1. Open the Vite app.
2. Set parameters to `70`, context to `16000`, quantization to `4-bit`, KV cache
   to `8-bit`, runtime to `llama.cpp GGUF`, architecture to `MoE`, active
   parameters to `8`, and enable model training plus LoRA adapter.
3. Calculate.
4. Confirm the result shows `48.5 GB`, `64 GB host RAM`, and primary hardware
   `A100 80GB`.
5. Confirm the calculation text uses `* 1.00` for the GGUF runtime.

## Run With
DEV
```sh
cd frontend && npm ci && npm run dev -- --port 5173      # open http://127.0.0.1:5173
```
or PROD-like
```sh
cd frontend && npm run build && npm run preview
```
Build and coverage
```sh
cd frontend && npm run gate
```
Manual check:
70B / 16000 ctx / 4-bit / 8-bit KV / GGUF / MoE active=8 / training+LoRA → 48.5 GB, 64 GB host RAM, A100 80GB

`gate` runs the frontend lint/type/security/build/test suite, frontend harness
self-tests, and then the repo Python harness gate. The git pre-commit hook runs
`.venv/bin/harness preflight`; the pre-push hook runs `.venv/bin/harness gate`.

## Owner notes
- Semgrep CA trust-store issue triggered from sandbox.
- Except for `plan.md`, all `.md` documents should stay < 100 lines.
