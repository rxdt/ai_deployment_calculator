# Project Status

> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Now

- First real spec written: `specs/vram_calculator.md` (VRAM = W + KV + T + C, then 1.10 margin).
- `src/` still empty (`.gitkeep`); core not yet implemented.

## Checks

- `uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` — green.

## Next

- PRIORITY 1: implement the pure core in `src/` — `DeploymentSpec` pydantic model plus
  `weights_gb`, `kv_cache_gb`, `task_overhead_gb`, `total_vram_gb`, with 100%-covered tests
  pinning the worked checks (8B/16-bit/8k inference -> 20.1).

## Blockers
-
-
-
