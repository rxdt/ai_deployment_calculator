> Current handoff. Keep it short and current.

## Current State

- Work on the current branch. do not auto-commit, push, pull, merge, or rebase without instruction.
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

## Open Items

1. VL pixel-proxy multiplies by `image_count` (`workload-memory.ts` L110);
   `specs/plan.md` defines it per single image. No test impact at the default
   `image_count=1`. Human decision: document the scaling or drop it.
2. Stale spec drift to reconcile (code + tests are the truth):
   `specs/frontend.md` L52-60 lists family/offload/architecture warnings the
   code never emits (`report.test.ts` "keeps family-specific guidance out of
   warnings" pins training + MoE + sharded-speed only); L523-530 describes a
   compare-with-my-GPU / `my_gpu_vram_gb` / `Fits_My_GPU` feature absent from
   `state.ts`/`report.ts` (the "Your GPU Fit" panel was removed by product
   decision). The prior "README says Active Parameters" item was false and is
   dropped: the README omits it and the `index.html` label is "Active
   Parameters".

## Blocked This Iteration

- Commit works: the `.githooks` pre-commit runs preflight (format, eslint,
  style, html) and it passes on this doc-only change. Running `harness`, `npx`,
  `pnpm`, or `git config` *directly* through the tool is approval-gated, but the
  git hooks invoke them fine, so that is not the blocker.
- Push is blocked: pre-push `gate` fails on 7 pre-existing `harness/cli.test.ts`
  failures (`runSetup` exits 2 vs expected 0/1/7; `preflight` exits 1 vs 0) plus
  `semgrep` SKIPPED (not installed). These live in the forbidden `harness/`
  path, predate this markdown-only change, and cannot be fixed here. Gate is red
  on `main`-adjacent WIP, not on the frontend. Human must repair the harness
  self-tests (or install `semgrep`) before any branch can push.

## Docs

- `specs/plan.md` and `specs/frontend.md` hold the canonical formula, hardware
  tiers, and per-family formulas.
