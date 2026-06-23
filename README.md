# AI Deployment Calculator

A deterministic Python calculator for estimating GPU VRAM needs for model
deployments. It separates model weights, KV cache, task overhead, and CUDA/system
tax so quantization does not get applied to memory that does not shrink.

## What It Calculates

`VRAM_GB = (W + KV + T + C) * 1.10`

- `W`: model weights from parameter count and weight precision.
- `KV`: context-window cache, sized independently from weight quantization.
- `T`: task overhead for inference, QLoRA, or full training.
- `C`: fixed CUDA/system tax.

The core worked check is:

```python
from vram_calculator import DeploymentSpec, total_vram_gb

spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
assert total_vram_gb(spec) == 20.1
```

## Deployment Plan Example

```python
from deployment_plan import deployment_plan
from vram_calculator import DeploymentSpec

spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
plan = deployment_plan(spec)

assert plan.primary.option.gpu.name == "A100 80GB"
assert plan.primary.fit == "single_gpu"
```

The matching web output shows `Primary: A100 80GB (single GPU)`, `52.3 GB`,
`64 GB host RAM`, and `Use an FP8 KV cache` for the optimization note. The
hardware table labels the RTX 4090 row as `3x 24 GB` and `tensor parallel`.

## Quantization Comparison Example

```python
from quantization_comparison import quantization_comparison
from vram_calculator import DeploymentSpec

comparison = quantization_comparison(DeploymentSpec(parameters_b=8, context_tokens=8000))
rows = [(row.weight_bits, row.total_gb, row.savings_gb, row.selected) for row in comparison.rows]

assert rows == [(16, 20.1, 0.0, True), (8, 11.3, 8.8, False), (4, 6.9, 13.2, False)]
```

The matching web output shows `16-bit`, `8-bit`, and `4-bit` rows with `20.1 GB`,
`11.3 GB`, and `6.9 GB` totals. The active precision row is highlighted.

## Current Features

- Pure typed calculator core in `src/vram_calculator.py`.
- Hardware recommendations in `src/hardware.py` for RTX 4090, A100, and H100.
- Host RAM floor recommendation and display-ready report assembly.
- GET-submitting one-page web app rendered by `src/web/page.py`.
- 100% test coverage across product code.

## Run Checks

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv run ralph verify
```

## Render The Page

```sh
PYTHONPATH=src uv run python -c "from web.page import render_page; print(render_page())" > scratchpad/vram_calculator.html
```

Open `scratchpad/vram_calculator.html` in a browser to view the static page.

## Serve The Page

```sh
PYTHONPATH=src uv run python -c "from wsgiref.simple_server import make_server; from web.app import application; make_server('', 8000, application).serve_forever()"
```

## Project Map

`specs/` is the source of truth, `docs/PROJECT_STATUS.md` is the handoff, `src/`
has product code, and `tests/` has product plus harness tests.

## Development Loop

This repo uses the Ralph loop harness. Each iteration should read `specs/`, pick
one unfinished item, keep edits small, update status/spec docs, run the gate, and
commit through the normal hooks.
