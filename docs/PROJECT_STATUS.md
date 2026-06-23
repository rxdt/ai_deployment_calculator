# Project Status

> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Now

- `specs/vram_calculator.md` is implemented through PRIORITY 4.
- `specs/deployment_plan.md` is active at PRIORITY 3.
- `specs/` contains the implemented VRAM spec and the active deployment-plan spec.
- Core VRAM math, deployment-plan guidance, presenter, view model, and a
  GET-submitting one-page WSGI app live under `src/` with 100% coverage.
- Reports and the web UI show the primary GPU plan plus the memory optimization note.
- `DeploymentSpec` is the only Pydantic model; web form state is a local dataclass.
- The page CSS keeps both desktop and mobile layouts within one viewport without enabling body scroll.
- README now reflects the AI deployment calculator instead of the source harness template.

## Checks

- `uv run ruff check . && uv run ruff format --check . && uv run pytest` — green.
- `uv run ralph verify` — green.

## Next

- deployment_plan PRIORITY 3: expose KV-cache precision in the web form.

## Blockers
-
-
-
