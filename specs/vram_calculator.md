# VRAM Deployment Calculator — Spec

PRIORITY 1 (implemented)

## Vision

A deterministic calculator that tells an AI engineer how much GPU VRAM a model
deployment needs, and what hardware/optimizations to run it on, so infra engineers
stop hand-computing every deployment. Pure Python core (one pydantic input model +
modular formula functions), 100% covered, later wrapped by a one-page web app.

## The equation (grounded in docs/plan.md, validated by its worked examples)

`VRAM_GB = (W + KV + T + C) * SAFETY_MARGIN`, rounded to 1 decimal.

- `W` (weights) `= P * (weight_bits / 8)`; `P` = parameters in billions.
- `KV` (cache) `= (P / 10) * (context_k / 8) * (kv_cache_bits / 16)`; `context_k` = context tokens / 1000.
  The KV cache stays 16-bit unless `kv_cache_bits < 16`; it never shrinks with weight quantization,
  and at long context can exceed the quantized weights.
- `T` (task overhead): inference = 0; QLoRA 4-bit fine-tune ~= 4; full 16-bit training ~= `P * 16`.
- `C` (CUDA/system tax) = 1.5 (constant).
- `SAFETY_MARGIN` = 1.10. `weight_bits` in {16, 8, 4}; `kv_cache_bits` in {16, 8, 4}.

Worked checks (subtotals before margin):

- 8B / 16-bit / 8k / inference -> W=16, KV=0.8, T=0, C=1.5 -> 18.3; with margin -> 20.1.
- 8B / 4-bit / 8k / QLoRA -> 4 + 0.8 + 4 + 1.5 = 10.3.
- 70B / 4-bit / 8k / QLoRA -> 35 + 7 + 4 + 1.5 = 47.5.

## Prioritize These Items

- `src/` pure core: ONE pydantic model (`DeploymentSpec`: `parameters_b`, `context_tokens`,
  `weight_bits`, `kv_cache_bits`, `task` = inference|qlora|full_training) plus modular functions
  `weights_gb`, `kv_cache_gb`, `task_overhead_gb`, `total_vram_gb`. 100% covered.

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

- [x] PRIORITY 1: pydantic model + formula functions, fully tested
- [x] PRIORITY 2: hardware/optimization recommendation
- [x] PRIORITY 3: one-page no-scroll web UI
- [x] PRIORITY 4: host RAM floor in the report and web UI

## Non-goals

- Throughput / tokens-per-second prediction; multi-node cluster planning; live GPU price data.
- No silent assumptions — every constant traces back to docs/plan.md.
