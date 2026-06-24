> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- The deployment-plan optimization note now keys sharding advice off the primary (recommended) plan, not the weakest catalog GPU, so single-card plans are never told to avoid tensor parallelism.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- The Vite web UI is dark themed, backend-wired through `/api/report`, accepts arbitrary positive decimal model sizes, escapes rendered query/report values, and keeps the form visible if the API fails.
- The LoRA adapter checkbox is disabled unless model training is enabled in both the Vite app and static fallback page; turning training off clears adapter state before submit.
- The static fallback also clears stale `use_adapter=on` query state on first render when `trained` is absent.
- Frontend dependency smoke tests now match the current Vite 8 manifest.
- Playwright config and Vite smoke specs are present under `frontend/`; smoke coverage includes all assumption labels, including supported precisions, but browser execution is blocked until dependencies are installed.
- A FastAPI app (`src/web/server.py`) serves `/api/report` JSON and the `/` fallback page, reusing the pure report path.
- The stdlib WSGI renderer remains as a static fallback page.
- `docs/plan.md` is distilled to the durable formula, product shape, and milestones.
- Tiny 400,000-parameter FP8 full-training sizing is documented and tested.
- Long-context 70B and 104B inference regression cases now assert weights, KV cache, task overhead, and totals.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `uv run pytest tests/test_page.py tests/test_server.py` — behavioral tests passed, then failed coverage because partial pytest covers only 63% of the repo.
- `uv run pytest` — green locally, 145 passed, 100% coverage.
- `uv run ralph gate` — green locally.
- `uv run ralph verify` — green locally.
- `cd frontend && npm run test:e2e` — blocked locally this iteration: `playwright: command not found`.
- Commit — local commit created.
- Push — blocked: `main` is behind `origin/main`, and `git pull --rebase origin main` cannot open `.git/FETCH_HEAD` in this sandbox.
- Branch: `main`.

## Next

- Run `cd frontend && npm install && npm run test:e2e` when browser dependencies are available.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers
- Frontend dependencies are not installed in this checkout, so Playwright cannot run.
- `git push -u origin main` is rejected as non-fast-forward, and rebase cannot write `.git/FETCH_HEAD` in this sandbox.
