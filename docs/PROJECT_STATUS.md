> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- The Vite web UI is dark themed, backend-wired through `/api/report`, accepts arbitrary positive decimal model sizes, escapes rendered query/report values, and keeps the form visible if the API fails.
- The LoRA adapter checkbox is disabled unless model training is enabled in both the Vite app and static fallback page; turning training off clears adapter state before submit.
- Playwright config and Vite smoke specs are present under `frontend/`; smoke coverage includes all assumption labels, including supported precisions, but browser execution is blocked until dependencies are installed.
- The stdlib WSGI renderer remains as a static fallback page.
- `docs/plan.md` is distilled to the durable formula, product shape, and milestones.
- Tiny 400,000-parameter FP8 full-training sizing is documented and tested.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `ruff check . && ruff format --check . && pytest` — green locally, 144 passed, 100% coverage.
- `cd frontend && npm run test:e2e` — blocked locally this iteration: `playwright: command not found`.
- Branch: `main`.

## Next

- Run `cd frontend && npm install && npm run test:e2e` when browser dependencies are available.
- Switch to simple FastAPI backend.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers
- None.
