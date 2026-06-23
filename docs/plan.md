# Plan

> Human vision and durable project context. `specs/` is the executable build
> plan; this file keeps the research summary short enough to hand off.

## Goal

Build a deterministic AI deployment calculator that helps engineers estimate GPU
VRAM, host RAM, hardware fit, and the most useful memory optimization without
hand-calculating every model deployment.

## Boundaries

- Do not edit `harness/` or `tests/harness/`.
- Work in `src/`, `tests/`, `specs/`, `docs/`, `README.md`, and `PROMPT.md`.
- Keep each change scoped to one spec-backed gap.
- Keep every markdown file under 100 lines.

## Core Equation

`VRAM_GB = (W + KV + T + C) * 1.10`, rounded to one decimal.

- `W = parameters_b * (weight_bits / 8)`.
- `KV = (parameters_b / 10) * (context_tokens / 1000 / 8) * (kv_cache_bits / 16)`.
- `T = 0` for inference, `4 GB` for QLoRA, and `parameters_b * 16` for full training.
- `C = 1.5 GB` CUDA/system tax.
- Weight and KV precision support: 16-bit, 8-bit, and 4-bit.
- Host RAM floor: at least 32 GB, rounded up in 16 GB increments from total VRAM.

Worked checks:

- 8B, 16-bit weights, 16-bit KV, 8k inference: `20.1 GB`.
- 8B, 4-bit weights, 16-bit KV, 8k QLoRA: `11.3 GB`.
- 70B, 4-bit weights, 16-bit KV, 8k QLoRA: `52.3 GB`.

## Research Notes

- Quantizing model weights does not quantize KV cache, CUDA overhead, gradients,
  optimizers, or adapter memory.
- Long-context deployments can become KV-cache bound even when weights are 4-bit.
- QLoRA keeps the base model small but still needs adapter and optimizer memory.
- Full training is intentionally coarse here; this calculator is for first-pass
  deployment sizing, not throughput or training-performance prediction.
- Hardware recommendations are fit estimates, not live availability or price data.

## Product Shape

- Pure typed Python core under `src/`.
- One pydantic input model: `DeploymentSpec`.
- Dataclasses for comparison, assumptions, hardware, plans, and reports.
- One-page GET-submitting web UI with no required JavaScript.
- Inputs: parameters, context window, task/training mode, weight precision,
  KV-cache precision, and adapter usage.
- Outputs: VRAM total and breakdown, host RAM, hardware table, primary plan,
  quantization comparison, and assumptions.

## Current Milestones

- Priority 1: VRAM formula and validated input model are implemented.
- Priority 2: hardware fit and host RAM recommendation are implemented.
- Priority 3: one-page web UI and quantization comparison are implemented.
- Priority 4: deployment plan and assumption transparency are implemented.

## Completion Criteria

- `uv run ralph gate` passes before commit
- `uv run ralph verify` passes before push.
- Specs, README, and project status match the code.
