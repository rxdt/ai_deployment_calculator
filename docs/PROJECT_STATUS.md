> Handoff. Keep it short and current.

## State

- Current branch: `harness-setup-config-overrides`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Styling has not started. `frontend/src/styles.css` is reset-only.
- This iteration fixed `Total Model Parameters` so the live form preserves
  fractional values like `3.8` instead of sanitizing them to integers.

## Calculation Contract

- Canonical equation:
  `Required_GB = (Weights + Working/Activation + Training_State + Runtime_Overhead) * Buffer`,
  rounded to one decimal.
- Decoder KV is architecture-based (`layers * kv_heads * head_dim * kv_bytes`),
  never `Active_P / 10`.
- QLoRA = frozen 4-bit base + adapter state. Full training = weights + master +
  grad + optimizer + activations.
- `decoder_scratch_gb` is scratch-included by product default (`weights * 0.05`
  server, `* 0.03` local). Scratch-zero is test-only.

## Frontend Reality

- `frontend/index.html` contains the current form, advanced assumptions, output
  slots, and template markup. Treat it as minimal, not styled.
- `frontend/src/app.ts` handles form normalization, numeric input cleanup, reset,
  adaptive control visibility, and report rendering.
- `Total Model Parameters` uses decimal input cleanup; app tests pin `3.8B`
  rendering to `11.4 GB`.
- `KV Cache Precision` is gated by `hasDecoderKvCache`, appears only for
  inference decoder-KV families, and offers `8-bit / FP8`, `16-bit`, `32-bit`.
- MoE visibility and calculation impact are gated by `hasMoeControl`; non-MoE
  families ignore stale hidden MoE checkbox/query values.
- Current warnings are only training, MoE, and sharded-tier speed guidance.
  Default inference renders no warnings; family caveats stay out of warnings.
- There is no compare-with-my-GPU input/state/report value, no `Accuracy`
  output, and no separate `Your GPU Fit` panel. `Estimate confidence` is a
  distinct, always-visible qualitative label (`ReportPayload.confidence`).

## Open Items

1. Continue the frontend JavaScript/HTML audit for remaining behavior gaps.
2. After JavaScript and HTML work is exhausted, start styling from
   `specs/DESIGN.md`.

## Checks

- `pnpm --prefix frontend run test:coverage -- frontend/src/app.test.ts`
  passed 117 tests with 100% coverage.
- `pnpm preflight` passed after staging the allowed files.
- `pnpm gate` passed format, lint, style, html, typecheck, markup, schema,
  dependency, spelling, workflow, audit, and build checks; `semgrep` was skipped
  because it is not installed locally.
- `pnpm gate` still fails in coverage: existing forbidden
  `harness/cli.test.ts` setup tests have 6 failures, followed by Vitest
  `coverage/.tmp` ENOENT. Do not edit `harness/`; human-owned blocker remains.
- No forbidden paths are staged.
