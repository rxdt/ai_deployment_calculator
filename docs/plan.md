# Plan

> Human vision and durable project context. `specs/` is the executable build
> plan; this file keeps the research summary short enough to hand off.

## Goal
Build a deterministic AI deployment calculator that helps engineers estimate GPU
VRAM, host RAM, hardware fit, and the most useful memory optimization without
hand-calculating every model deployment.

## Priorities

- [ ] Research and record formula for GGUF running via llama.cpp
- [ ] Add support for calculating GGUF (running via llama.cpp) where GB = W + KV + T + C  (Notice the * 1.10 multiplier is gone)
- [ ] Research and record formula for LoRA and QLoRA (only the weights shrink for QLoRA)
- [ ] Add support for calculating LoRA and QLoRA (only the weights shrink for QLoRA)
- [x] Add PyTorch MoE support using total parameters for weights and active parameters for KV cache.
- [ ] Research GGUF MoE offload
- [ ] MoE as well? Memory = ((47 * 0.5)_W + (1.3 * 1 * 1)_KV + 0_T + 0.5_C) * 1.0

## Boundaries

- Do not edit `harness/` or `tests/harness/`.
- Work in `src/`, `tests/`, `specs/`, `docs/`, `README.md`, and `PROMPT.md`.
- Keep each change scoped to one spec-backed gap.
- Keep every markdown file under 100 lines.

## Add Additional Tests Cases if not present:

- 70B parameters, Weights: 4-bit, Context: 128k tokens, KV Cache: 8-bit, Task: Inference, CUDA
- 7B, 16FP, KV cache 16FP, Task: Full Training, CUDA
- 3.8B, Context: 8k, KV Cache: 16b, Task: QLoRA, CUDA
- 104B, int8, Context 32000 tokens, 16-bit KV, Task: Inference, CUDA
- GGUF using llama.cpp: (1.0 multiplier instead of 1.1) 104B, Context 32000 tokens, 32-bit KV, Task: Inference, CUDA (0.5 multiplier because GGUF)
- 7B, bf8, Context 1000000, KV cache FP16, Task: Inference, CUDA
- 8B, 16-bit base, 2% trainable => adapter/optimizer overhead = trainable-params-percentage * 8 * buffer 1.10

## Core Equation

`VRAM_GB = (W + KV + T + C) * 1.10`, rounded to one decimal.

- `W = parameters_b * (weight_bits / 8)`.
- `KV = (parameters_b / 10) * (context_tokens / 1000 / 8) * (kv_cache_bits / 16)`.
- `T = 0` for inference, `4 GB` for QLoRA, and `parameters_b * 16` for full training.
- `C = 1.5 GB` CUDA/system tax.
- Weight and KV precision support: 32-bit, 16-bit, 8-bit, and 4-bit.
- Host RAM floor: at least 32 GB, rounded up in 16 GB increments from total VRAM.

Worked checks:

- 8B, 16-bit weights, 16-bit KV, 8k inference: `20.1 GB`.
- 8B, 4-bit weights, 16-bit KV, 8k QLoRA: `11.3 GB`.
- 70B, 4-bit weights, 16-bit KV, 8k QLoRA: `52.3 GB`.
- MoE 47B total, 1.3B active, 16-bit KV, 8k inference: `106.5 GB`.
- 400,000 parameters is `0.0004` billion; with 8-bit weights, 8-bit KV,
  8k context, and full training, total VRAM rounds to `1.7 GB`.

## Research Notes

- Quantizing model weights does not quantize KV cache, CUDA overhead, gradients,
  optimizers, or adapter memory.
- Long-context deployments can become KV-cache bound even when weights are 4-bit.
- QLoRA keeps the base model small but still needs adapter and optimizer memory.
- Full training is intentionally coarse here; this calculator is for first-pass
  deployment sizing, not throughput or training-performance prediction.
- Hardware recommendations are fit estimates, not live availability or price data.
- Open questions: CPU selection, memory-bandwidth-aware recommendations, and
  non-PyTorch backend formulas for GGUF/llama.cpp, vLLM, and Apple MLX.

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

- [ ] Priority 1:
- [ ] Priority 2:
- [ ] Priority 3:
- [ ] Priority 4:

## Run often

- `ruff check . && ruff format --check . && pytest` passes with 100% coverage.
- `pyright` passes.
- `semgrep scan --config auto --config p/secrets --error` passes.

## Completion Criteria

- `uv run ralph gate` passes before commit
- `uv run ralph verify` passes before push.
- Specs, README, and project status match the code.
