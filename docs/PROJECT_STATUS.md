# Project Status

> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Now

- `specs/vram_calculator.md` is implemented through PRIORITY 4.
- `specs/deployment_plan.md` is implemented through PRIORITY 4.
- `specs/assumption_transparency.md` is implemented through PRIORITY 1.
- `specs/quantization_comparison.md` is implemented through PRIORITY 3.
- Core VRAM math, deployment-plan guidance, presenter, view model, and a
  GET-submitting one-page WSGI app live under `src/` with 100% coverage.
- `src/quantization_comparison.py` compares 16-bit, 8-bit, and 4-bit weight precision
  totals with savings versus 16-bit.
- `DeploymentReport` exposes the quantization comparison; the web UI renders all
  three weight-precision totals and savings.
- Reports and the web UI show the primary GPU plan plus the memory optimization note.
- The web form exposes KV-cache precision alongside weight quantization.
- Reports and the web UI expose the fixed assumptions behind every estimate.
- `DeploymentSpec` is the only Pydantic model; web form state is a local dataclass.
- The page CSS keeps both desktop and mobile layouts within one viewport without enabling body scroll.
- README includes deployment-plan and quantization-comparison API and web-output examples.
- Hardware missing: T4, B200

## Checks

- `uv run ruff check . && uv run ruff format --check . && uv run pytest` — green.
- `uv run ralph verify` — green.
- Branch: `main`.

## Next

- Add the remaining hardware catalog entries called out below, starting with T4.

## Blockers
- None.
