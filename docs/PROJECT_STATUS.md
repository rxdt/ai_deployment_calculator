> Handoff. Keep it short and current.

## State

- Current branch: `harness-setup-config-overrides`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Initial `DESIGN.md` styling is in `frontend/src/styles.css`: dark compact
  calculator layout, tokenized CSS, and collapsed desktop/mobile one-page fit.
- Default outputs now match the first-glance contract: total, confidence, GPU
  class, and collapsed details only; the old visible heuristics note is gone.
- `harness/cli.ts`, `harness/vitest.config.js`, `.gitignore`, `specs/plan.md`,
  and docs screenshot/calc image changes are pre-existing/unrelated; leave
  unstaged unless a human asks.

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
  slots, and template markup. Styled class names are hyphenated for lint.
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

1. Continue visual polish only after keeping `pnpm preflight` green.
2. Confirm whether unrelated docs image and `.gitignore` changes should stay.

## Checks

- `pnpm build` passed; `5173` was occupied by a dev server, so production
  preview ran at `http://127.0.0.1:5174/`.
- Browser measurement passed: desktop `1280x720` and mobile `390x844` both fit
  exactly with no horizontal overflow, no small touch targets, and min text 13px.
- `pnpm --prefix frontend run test:coverage` passed 120 tests, 100% coverage.
- Responsive Playwright spec passed against preview via temporary scratchpad
  config: 6 tests.
- `pnpm preflight` passed after tokenizing CSS and staging only this iteration's
  files.
- `pnpm gate` passed through build but failed in coverage on the existing
  forbidden `harness/cli.test.ts` setup failures (`runSetup`/`setup` return 2).
