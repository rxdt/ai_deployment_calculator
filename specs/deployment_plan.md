# Deployment Plan Spec

PRIORITY 1 (active)

## Vision

Turn the calculator from "these GPUs can fit this workload" into a short
deployment plan an AI engineer can act on: recommended card choice, fit status,
sharding requirement, and the highest-impact memory optimization when the plan is
awkward.

## Current Gap

The app already computes total VRAM, host RAM, and per-GPU card counts. It does
not yet choose a primary recommendation, label risky multi-card plans, or explain
which memory lever to try first.

## Prioritize These Items

- Add a pure `src/` deployment-plan layer with no new Pydantic model.
- Input is `DeploymentSpec`; output is typed dataclasses only.
- Select one primary hardware option from the existing catalog:
  - prefer the lowest GPU count;
  - prefer no tensor parallelism when counts tie;
  - preserve catalog order as the final tiebreaker.
- Add a fit label for each option:
  - `single_gpu` when one card fits;
  - `tensor_parallel` when 2-4 cards are required;
  - `large_shard` when more than 4 cards are required.
- Add one optimization note:
  - if `weight_bits` is above 4, recommend lowering weight precision first;
  - else if `kv_cache_bits` is above 8 and context is nonzero, recommend FP8 KV cache;
  - else if any option needs tensor parallelism, recommend reducing context or using larger-memory GPUs;
  - otherwise say no memory optimization is needed.

## If The Items Above Are Complete, Do These

- PRIORITY 2: show the primary deployment plan in the report and web UI.
- PRIORITY 3: expose KV-cache precision in the web form so users can evaluate FP8/FP4 KV cache.
- PRIORITY 4: add README examples for the deployment-plan API and web output.

## Acceptance Signals

- `uv run ralph verify` green; 100% coverage remains.
- A 70B / 4-bit / 8k / QLoRA deployment recommends a single A100 80GB or H100 80GB option.
- A plan that needs more than one card labels tensor parallelism clearly.
- Optimization notes change when weight precision, KV precision, and context change.

## Non-goals

- Throughput, tokens per second, live pricing, cloud availability, or multi-node planning.
