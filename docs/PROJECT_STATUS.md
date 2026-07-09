> Handoff. Keep it short and current.

## State

- Current branch: `main`.
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
  checkpointing, memory sharding, and decoder KV scaling inputs.
- `Known Model File Size` overrides QLoRA base model memory.
- New this iteration: direct nonzero-model calculations clamp
  `Concurrent Requests` / `Micro Batch Size` to at least `1` so a zero request
  or batch count cannot erase workload-sensitive memory.

## Commands

- Focused calculator unit test:
  `pnpm --dir frontend exec vitest run src/calculator.test.ts`
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

- `pnpm --dir frontend exec vitest run src/calculator.test.ts` passed:
  61 tests.
- `pnpm preflight` passed: prettier check, eslint, stylelint, html-validate.
- `pnpm gate` passed: format, lint, typecheck, schema, dependency checks,
  deadcode, spelling, workflow lint, SAST, secrets, audit, build, coverage,
  Playwright, and Lighthouse.

## Blockers

- No blocker for the scoped frontend change.
- Existing unstaged human-owned forbidden edits remain in `harness/gate.ts` and
  `harness/gate.test.ts`; agents must not stage or alter them.
