> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- The deployment-plan optimization note now keys sharding advice off the primary (recommended) plan, not the weakest catalog GPU, so single-card plans are never told to avoid tensor parallelism.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- The Vite web UI is dark themed, backend-wired through `/api/report`, accepts arbitrary positive decimal model sizes, escapes rendered query/report values, keeps the form visible if the API fails, and normalizes invalid URL params before display/fetch.
- The LoRA adapter checkbox is disabled unless model training is enabled in both the Vite app and static fallback page; turning training off clears adapter state before submit.
- The static fallback also clears stale `use_adapter=on` query state on first render when `trained` is absent.
- Frontend dependency smoke tests now match the current Vite 8 manifest.
- Playwright config and Vite smoke specs are present under `frontend/`; smoke coverage includes all assumption labels, supported precisions, and invalid URL-param normalization.
- A FastAPI app (`src/web/server.py`) serves `/api/report` JSON and the `/` fallback page, reusing the pure report path.
- `tests/test_api.py` pins the full `/api/report` JSON contract (keys, row counts, string value types) the Vite `ReportPayload` depends on.
- The stdlib WSGI renderer remains as a static fallback page.
- `docs/plan.md` is distilled to the durable formula, product shape, and milestones.
- Tiny 400,000-parameter FP8 full-training sizing is documented and tested.
- Long-context 70B and 104B inference regression cases now assert weights, KV cache, task overhead, and totals.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `uv run pytest tests/test_frontend.py` — green locally, 4 passed.
- `uv run ruff check tests/test_frontend.py` — green locally.
- `cd frontend && npm run build` — green locally.
- `cd frontend && TMPDIR=/Users/rxdt/ai_deployment_calculator/scratchpad/playwright-tmp npm run test:e2e` — blocked: Chromium launch fails with `bootstrap_check_in ... Permission denied (1100)`.
- `uv run ralph gate` — blocked before project checks by pre-existing protected-path edits in `.github/workflows/ci.yml`, `docs/plan.md`, and `pyproject.toml`.
- `uv run pytest` — previously green locally, 150 passed, 100% coverage.
- `uv run ralph verify` — blocked: the `security` (semgrep) step aborts with a ca-certs/network error in this sandbox; lint, types, tests, and coverage pass.
- Commit/push — blocked: this sandbox cannot create `.git/index.lock`, so staged protected paths cannot be cleared and no commit can be made.
- Branch: `main`.

## Next

- Run Playwright in an environment where Chromium can register its Mach port.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers
- Pre-existing protected-path edits block `ralph gate`: `.github/workflows/ci.yml`, `docs/plan.md`, and `pyproject.toml`.
- Git index writes fail with `Unable to create ... .git/index.lock: Operation not permitted`; commit/push blocked. Agent Codex-code_review-1/1.
- `ralph verify`'s `security` step (semgrep) previously failed on a ca-certs/network error in this sandbox. Agent Claude-codereview-1.
- Chromium cannot launch under this macOS sandbox for Playwright (`bootstrap_check_in ... Permission denied (1100)`). Agent Codex-code_review-1/1.
