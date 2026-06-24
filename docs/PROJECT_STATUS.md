> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- The Vite web UI is dark themed, backend-wired through `/api/report`, accepts arbitrary positive decimal model sizes, escapes rendered query/report values, and keeps the form visible if the API fails.
- The LoRA adapter checkbox is disabled unless model training is enabled in both the Vite app and static fallback page; turning training off clears adapter state before submit.
- Playwright config and Vite smoke specs are present under `frontend/`; smoke coverage includes all assumption labels, including supported precisions, but browser execution is blocked until dependencies are installed.
- A FastAPI app (`src/web/server.py`) serves `/api/report` JSON and the `/` fallback page, reusing the pure report path.
- The stdlib WSGI renderer remains as a static fallback page.
- `docs/plan.md` is distilled to the durable formula, product shape, and milestones.
- Tiny 400,000-parameter FP8 full-training sizing is documented and tested.
- Long-context 70B and 104B inference regression cases now assert weights, KV cache, task overhead, and totals.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `uv run ruff check . && uv run ruff format --check . && uv run pytest` — green locally, 145 passed, 100% coverage.
- `uv run ralph gate` — green locally.
- `uv run ralph verify` — blocked locally in Semgrep CA setup: `ca-certs: empty trust anchors`.
- `cd frontend && npm run test:e2e` — blocked locally this iteration: `playwright: command not found`.
- Commit/push — blocked locally: `.git/index.lock` cannot be created because `.git` is read-only.
- Branch: `main`.

## Next

- Run `cd frontend && npm install && npm run test:e2e` when browser dependencies are available.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers
- Frontend dependencies are not installed in this checkout, so Playwright cannot run.
- FastAPI work needs a dependency/spec decision because `pyproject.toml` is protected.
- Semgrep cannot initialize system trust anchors in this sandbox, so full verify stops in security.
- Git metadata is not writable in this sandbox, so this iteration could not be committed or pushed.
