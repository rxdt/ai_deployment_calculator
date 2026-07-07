> Handoff. Keep it short and current.

## State

- Current branch: `harness-setup-config-overrides`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Styling has not started. `frontend/src/styles.css` is reset-only.
- This iteration aligned the hero output label with the contract:
  `Recommended GPU Class`.

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
- `KV Cache Precision` is gated by `hasDecoderKvCache`, appears only for
  inference decoder-KV families, and offers `8-bit / FP8`, `16-bit`, `32-bit`.
- Current warnings are only training, MoE, and sharded-tier speed guidance.
  Default inference renders no warnings; family caveats stay out of warnings.
- There is no compare-with-my-GPU input/state/report value, no `Accuracy`
  output, and no separate `Your GPU Fit` panel.

## Open Items

1. Continue the frontend JavaScript/HTML audit for remaining behavior gaps.
2. After JavaScript and HTML work is exhausted, start styling from
   `specs/DESIGN.md`.

## Checks

- `pnpm --prefix frontend run test:coverage -- frontend/src/app.test.ts`
  passes: 112 tests, 100% coverage.
- `pnpm preflight` passes after staging current changes.
- `pnpm gate` passes format, lint, style, HTML, typecheck, markup, schema,
  dependency, spelling, audit, and build checks, then fails in existing
  forbidden `harness/cli.test.ts` setup tests returning status 2.
