> Handoff. Keep it short and current.

## State

- Current branch: `harness-setup-config-overrides`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Styling has not started. `frontend/src/styles.css` is reset-only.
- This iteration added an always-visible `Estimate confidence` hero label
  (`Rough` for diffusion/video/custom, `Estimated` otherwise) via
  `frontend/src/confidence.ts`, closing plan acceptance criteria #14 and #25.

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

- Direct `pnpm`/`node`/harness commands require interactive approval
  unavailable in this session, but the git pre-commit hook runs preflight, so
  the confidence-label commit was gated through it.
- Preflight (pre-commit hook: prettier, eslint, stylelint, html-validate, plus
  the Ralph banned-pattern and data-* selector preference checks) PASSED for
  this commit. It rejected the prior iteration's `.closest("details")` selector
  and a prettier break, both fixed here (ancestor walk; table-driven test).
- NOT run this session: `tsc` typecheck, `frontend` build, and vitest coverage
  (all gate-only, `pnpm gate`). A human must run `pnpm gate` to confirm types,
  build, and 100% coverage before push.
- The unrelated working-tree edit to forbidden `PROMPT.md` was left unstaged for
  human review.
- Last verified (prior iteration): `pnpm --prefix frontend run test:coverage`
  passed 114 tests, 100% coverage; `pnpm preflight` passed after staging.
- `pnpm gate` passes static/type/build/audit/frontend checks, then fails in
  existing forbidden `harness/cli.test.ts` setup tests returning status 2.
