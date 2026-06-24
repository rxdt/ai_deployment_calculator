> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- The deployment-plan optimization note now keys sharding advice off the primary (recommended) plan, not the weakest catalog GPU, so single-card plans are never told to avoid tensor parallelism.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- The Vite web UI is dark themed, backend-wired through `/api/report`, accepts arbitrary positive decimal model sizes, escapes rendered query/report values, keeps the form visible if the API fails, and normalizes invalid URL params before display/fetch.
- The Vite web UI ignores stale `/api/report` responses so older in-flight requests cannot overwrite newer submitted inputs.
- The LoRA adapter checkbox is disabled unless model training is enabled in both the Vite app and static fallback page; turning training off clears adapter state before submit.
- The static fallback also clears stale `use_adapter=on` query state on first render when `trained` is absent.
- Frontend dependency smoke tests now match the current Vite 8 manifest.
- Playwright config and Vite smoke specs are present under `frontend/`; smoke coverage includes all assumption labels, supported precisions, and invalid URL-param normalization.
- A FastAPI app (`src/web/server.py`) serves `/api/report` JSON and the `/` fallback page, reusing the pure report path.
- README documents the end-to-end app run path: start `uvicorn --app-dir src` on port 8000, then Vite on port 5173.
- `tests/test_api.py` pins the full `/api/report` JSON contract (keys, row counts, string value types) the Vite `ReportPayload` depends on.
- The stdlib WSGI renderer remains as a static fallback page.
- `docs/plan.md` is distilled to the durable formula, product shape, and milestones.
- Tiny 400,000-parameter FP8 full-training sizing is documented and tested.
- Long-context 70B and 104B inference regression cases now assert weights, KV cache, task overhead, and totals.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `UV_CACHE_DIR=/Users/rxdt/ai_deployment_calculator/scratchpad/uv-cache uv run pytest tests/test_readme.py` — green locally, 1 passed.
- `uv run pytest tests/test_frontend.py` — previously green locally, 4 passed.
- `UV_CACHE_DIR=/Users/rxdt/ai_deployment_calculator/scratchpad/uv-cache timeout 5 uv run uvicorn --app-dir src web.server:app --host 127.0.0.1 --port 8000` — started locally.
- `uv run ruff check tests/test_frontend.py` — green locally.
- `cd frontend && npm run build` — green locally.
- `cd frontend && TMPDIR=/Users/rxdt/ai_deployment_calculator/scratchpad/playwright-tmp npm run test:e2e` — blocked before test bodies: Chromium launch fails with `bootstrap_check_in ... Permission denied (1100)`.
- `UV_CACHE_DIR=/Users/rxdt/ai_deployment_calculator/scratchpad/uv-cache uv run ralph gate` — green locally.
- `uv run pytest` — previously green locally, 150 passed, 100% coverage.
- `UV_CACHE_DIR=/Users/rxdt/ai_deployment_calculator/scratchpad/uv-cache ... TMPDIR=/Users/rxdt/ai_deployment_calculator/scratchpad/tmp uv run ralph verify` — green locally.
- Branch: `main`.

## Next

- Run Playwright in an environment where Chromium can register its Mach port.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers
- Chromium cannot launch under this macOS sandbox for Playwright (`bootstrap_check_in ... Permission denied (1100)`). Agent Codex-code_review-1/1.
