# VRAM Deployment Calculator — Spec

PRIORITY 1 (implemented)

## Vision

A deterministic calculator that tells an AI engineer how much GPU VRAM a model
deployment needs, and what hardware/optimizations to run it on, so infra engineers
stop hand-computing every deployment. Pure Python core (one pydantic input model +
modular formula functions), 100% covered, later wrapped by a one-page web app.

## The equation (grounded in docs/plan.md, validated by its worked examples)

`VRAM_GB = (W + KV + T + C) * runtime_margin`, rounded to 1 decimal.

- `W` (weights) `= P * (weight_bits / 8)`; `P` = parameters in billions.
- `KV` (cache) `= (P / 10) * (context_k / 8) * (kv_cache_bits / 16)`; `context_k` = context tokens / 1000.
  The KV cache scales from the 16-bit reference by `kv_cache_bits / 16`; it never shrinks with
  weight quantization, and at long context can exceed the quantized weights.
  MoE deployments still use total parameters for `W`, but use active parameters directly for `KV`.
- `T` (task overhead): inference = 0; QLoRA default ~= 4; adapter fine-tuning with a trainable
  percentage = `P * trainable% * 8 * 1.10`; full 16-bit training ~= `P * 16`.
- `C` (CUDA/system tax) = 1.5 (constant).
- `runtime_margin` = 1.10 for PyTorch and 1.0 for llama.cpp GGUF.
  `weight_bits` in {32, 16, 8, 4};
  `kv_cache_bits` in {32, 16, 8, 4}.

Worked checks (subtotals before margin):

- 8B / 16-bit / 8k / inference -> W=16, KV=0.8, T=0, C=1.5 -> 18.3; with margin -> 20.1.
- 8B / 4-bit / 8k / QLoRA -> 4 + 0.8 + 4 + 1.5 = 10.3.
- 70B / 4-bit / 8k / QLoRA -> 35 + 7 + 4 + 1.5 = 47.5.
- MoE 47B total / 1.3B active / 16-bit / 8k / inference -> W=94, KV=1.3, T=0, C=1.5 -> 106.5.
- GGUF 104B / 4-bit / 32-bit KV / 32k inference -> W=52, KV=83.2, T=0, C=1.5 -> 136.7.
- 0.0004B / 8-bit / 8k / full training with 8-bit KV -> total rounds to 1.7 GB.

## Prioritize These Items

- `src/` pure core: ONE pydantic model (`DeploymentSpec`: `parameters_b`, `context_tokens`,
  `weight_bits`, `kv_cache_bits`, `task` = inference|qlora|full_training, `architecture`,
  optional `active_parameters_b`, `runtime`) plus modular functions
  `weights_gb`, `kv_cache_gb`, `task_overhead_gb`, `total_vram_gb`. 100% covered.
- Support 32-bit, 16-bit, 8-bit, and 4-bit weight and KV precision.
- Support percentage-based LoRA/QLoRA adapter overhead without shrinking KV cache.

## If The Items Above Are Complete, Do These

- PRIORITY 2: hardware recommendation — map `total_vram_gb` to GPU options (e.g. T4 16GB,
  RTX 4090 24GB, L4 24GB, A100 40/80GB, H100 80GB), GPU count, and whether tensor parallelism is needed.
- PRIORITY 3: one-page web app (no scroll); inputs = trained checkbox, quantization dropdown,
  KV-cache precision dropdown, parameters, context window, secondary adapter (LoRA).
- PRIORITY 4: host RAM floor — report the CPU/system RAM to pair with the deployment as the greater
  of 32 GB and `total_vram_gb` rounded up to the next 16 GB increment.

## Acceptance signals

- `uv run ralph verify` green; 100% coverage on `src/`.
- `total_vram_gb` for 8B / 16-bit / 8k / inference == 20.1; subtotals match the worked checks above.
- Tiny 400,000-parameter full-training estimates stay valid and are dominated by CUDA/system tax.
- Long-context 70B and 104B inference regressions are covered with explicit subtotal checks.

- [x] PRIORITY 1: pydantic model + formula functions, fully tested
- [x] PRIORITY 2: hardware/optimization recommendation
- [x] PRIORITY 3: one-page no-scroll web UI
- [x] PRIORITY 4: host RAM floor in the report and web UI
- [x] MoE support using total parameters for weights and active parameters for KV cache
- [x] GGUF llama.cpp runtime support with no final safety multiplier
- [x] LoRA/QLoRA adapter overhead from trainable parameter percent

## Non-goals

- Throughput / tokens-per-second prediction; multi-node cluster planning; live GPU price data.
- No silent assumptions — every constant traces back to docs/plan.md.

## Blockers
-
-

## COMPLETE ?

- [x] TRUE
- [ ] FALSE
