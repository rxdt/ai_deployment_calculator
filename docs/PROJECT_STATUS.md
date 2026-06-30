> Current handoff. Keep it short and current.

## Current State

- Branch is `main`, 1 commit behind `origin/main`. Working tree has uncommitted
  changes; do not auto-commit, push, pull, merge, or rebase without instruction.
- The shipped app is a static Vite + TypeScript calculator. `CalculatorApp`
  normalizes form state, calls local `buildReport(state)`, and renders
  synchronously. No backend, no `/api/report`.

## Calculation (frontend TypeScript is the source of truth)

- Canonical equation: `Required_GB = (Weights + KV + Working/Activation +
Training_State + Runtime_Overhead) * Buffer`, rounded to one decimal.
- Decoder KV is architecture-based (`layers * kv_heads * head_dim * kv_bytes`),
  never `Active_P / 10`. QLoRA = frozen 4-bit base + adapter state (no flat
  4 GB). Full training = weights + master + grad + optimizer + activations (no
  `P * 16`).
- `decoder_scratch_gb` is **scratch-included** by product default
  (`weights * 0.05` server, `* 0.03` local). Scratch-zero is test-only. Disclosed
  in the "Activation memory" tooltip.
- Runtime presets: server `overhead 1.5 / buffer 1.10 / util 0.85`; local
  `0.5 / 1.00 / 0.90`; any training `4.0 / 1.25 / 0.80`.

## Hardware, Speed, Fit (no cost)

- One canonical `HARDWARE_TIERS` table in `frontend/src/hardware.ts` drives
  recommendation, labels, examples, and speed bandwidth. Tiers:
  `8, 12, 16, 24, 48, 80, 141 (H200), 160, 180 (B200), 320`.
- Generic class labels are primary UI text; vendor names live in `examples`.
- Sharded aggregate tiers (160, 320) are eligible only when the advanced
  `memory_sharding_enabled` toggle is on (default off). Otherwise overflow.
- Speed uses the recommended tier's `bandwidthGbps` (no global constant);
  overflow uses the largest tier.
- Cost is not computed.
- What is calculated: `Usable_VRAM_GB =
Tier_GB * util` and `Fit_Headroom_GB = Usable - Required` (overflow/empty show
  `n/a`).

## Checks From This Pass

- `npm --prefix frontend run gate` - green (preflight, lint, typecheck,
  security, build, coverage, e2e).
- 98 unit tests pass; coverage 100% (stmts/branch/funcs/lines).
- 8/8 Playwright e2e pass, including axe.

## Open Items (none block launch)

1. VL pixel-proxy multiplies by `image_count` (`workload-memory.ts`); plan
   defines it per single image. No test impact at `image_count=1` (default).
   Decide document-vs-drop.
2. Compare-with-my-GPU is advisory only: `my_gpu_vram_gb` triggers the local
   offload warning but the report does not surface a `Fits_My_GPU` value.
3. README still says "Active Parameters"; the field label is now "Active
   parameters per token".

## Docs

- `docs/plan.md` and `specs/frontend.md` hold the canonical formula, hardware
