> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- `docs/plan.md` is distilled to the durable formula, product shape, and milestones.
- Tiny 400,000-parameter FP8 full-training sizing is documented and tested.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `uv run ruff check . && uv run ruff format --check . && uv run pytest` — green.
- `uv run ralph verify` — green.
- Branch: `main`.

## Next

- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers
- None.
