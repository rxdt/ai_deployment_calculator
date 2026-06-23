> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- `docs/plan.md` is distilled to the durable formula, product shape, and milestones.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `uv run ruff check . && uv run ruff format --check . && uv run pytest` — green.
- `uv run ralph verify` — green.
- Branch: `main`.

## Next

- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.

## Blockers
- None.
