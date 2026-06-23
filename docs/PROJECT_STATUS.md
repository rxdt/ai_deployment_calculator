# Project Status

> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Now

- `specs/vram_calculator.md` is implemented through PRIORITY 4.
- `specs/` contains only the active project spec and a test guards against template placeholders.
- Core VRAM math, GPU and host RAM recommendations, presenter, view model, and a
  GET-submitting one-page WSGI app live under `src/` with 100% coverage.
- The page CSS keeps both desktop and mobile layouts within one viewport without enabling body scroll.
- README now reflects the AI deployment calculator instead of the source harness template.

## Checks

- `uv run ruff check . && uv run ruff format --check . && uv run pytest` — green.
- `uv run ralph verify` — green.

## Next

- Add the next real spec track; current VRAM spec has no unfinished priority items.

## Blockers
-
-
-
