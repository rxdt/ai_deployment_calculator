> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- The Vite web UI is dark themed, backend-wired through `/api/report`, and accepts tiny models.
- The stdlib WSGI renderer remains as a static fallback page.
- `docs/plan.md` is distilled to the durable formula, product shape, and milestones.
- Tiny 400,000-parameter FP8 full-training sizing is documented and tested.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `ruff check . && ruff format --check . && pytest` — green locally, 142 passed, 100% coverage.
- `uv run ralph verify` — green.
- Branch: `main`.

## Next

- Switch to simple FastAPI backend.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers
- None.
