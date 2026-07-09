> Handoff. Keep it short and current.

## State

- Current branch: `main`; latest agent commit: current `HEAD`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Default output contract: hero glance first, four collapsed result detail
  panels, no `Accuracy` or `Your GPU Fit`, and default inference warnings
  hidden.
- Hidden adaptive controls disable descendants; hidden MoE selection is cleared
  before returning to MoE-applicable families.
- Responsive coverage pins default, long workload-name, and expanded
  advanced-assumptions states inside the viewport.
- Report assumptions show advanced inputs that affect estimates: known file
  size, GPU resident fraction, LoRA trainable percent, optimizer, gradient
  checkpointing, memory sharding, decoder KV scaling inputs, and non-KV
  workload scaling inputs.
- `Known Model File Size` overrides QLoRA base model memory.
- New this iteration: training activation memory now uses family-specific
  workload proxies for vision, diffusion, video, audio, tabular, and custom
  training estimates instead of falling back to text context length.
- New this iteration: shared workload sizing lives in
  `frontend/src/workload-sizing.ts` so inference and training parse common
  image/video/audio/tabular/custom sizing controls consistently.
- New this iteration: advanced numeric assumptions now enforce their real upper
  bounds in both live form input and URL state normalization: GPU resident
  fraction is capped at `1`, and LoRA trainable percent is capped at `100`.
- New this iteration: direct calculation state also enforces impossible semantic
  caps: LoRA trainable percent cannot exceed `100`, and MoE active parameters
  cannot exceed total parameters.
- New this iteration: model-memory gating now treats a positive
  `Known Model File Size` as real resident memory even when total parameters are
  unknown, while zero model memory no longer produces workload-only activation,
  runtime, or speed estimates.

## Commands

- Focused report/app/calculator unit test:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts src/calculator.test.ts`
- Preflight: `pnpm preflight`
- Full gate: `pnpm gate`
- Common focused checks:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
- Full frontend coverage: `pnpm --prefix frontend run test:coverage`
- Build: `pnpm --prefix frontend run build`
- Playwright:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Lighthouse:
  `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`

## Checks

- `pnpm --dir frontend exec vitest run src/calculator.test.ts` passed: 70 tests.
- `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts src/calculator.test.ts`
  passed: 140 tests.
- `pnpm --dir frontend exec vitest run src/state.test.ts src/app.test.ts`
  passed: 63 tests.
- `pnpm --dir frontend exec vitest run src/calculator.test.ts` passed: 72 tests.
- `pnpm --dir frontend exec vitest run src/calculator.test.ts` passed: 74 tests.
- `pnpm preflight` passed: prettier check, eslint, stylelint, html-validate.
- `pnpm gate` passed: format, lint, typecheck, schema, dependency checks,
  deadcode, spelling, workflow lint, SAST, secrets, audit, build, coverage,
  Playwright, and Lighthouse.

## Blockers

- No blocker for the scoped frontend change.
- Existing unstaged human-owned forbidden edits remain in `PROMPT.md`,
  `harness/gate.ts`, and `harness/gate.test.ts`; agents must not stage or alter
  them.
