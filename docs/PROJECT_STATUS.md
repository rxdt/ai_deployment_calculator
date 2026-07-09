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
- New this iteration: report assumption rows now display resolved numeric
  fallback values for malformed direct state, matching the formula inputs.

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
- `pnpm --dir frontend exec vitest run src/report.test.ts` passed: 23 tests.
- `pnpm gate` passed: format, lint, typecheck, schema, dependency checks,
  deadcode, spelling, workflow lint, SAST, secrets, audit, build, coverage,
  Playwright, and Lighthouse.

## Blockers

- HARD BLOCKER (this iteration): the permission policy in this non-interactive
  session denies direct code-execution commands from Bash. `pnpm preflight`,
  `pnpm gate`, `node harness/harness.mjs preflight`, `node -e ...`,
  `pnpm --dir frontend exec vitest run [...]`, and
  `frontend/node_modules/.bin/vitest` all return "This command requires
  approval" and are auto-denied; only read-only inspection (`git`, `ls`, `cat`,
  `wc`, `grep`, `node --version`) runs. The git pre-commit hook DOES run
  `harness preflight` automatically (prettier, eslint, stylelint, html-validate
  passed on the commit that carried this note), so format/lint/html are covered
  on commit. But the full `pnpm gate` — vitest unit/property tests, typecheck,
  coverage, build, Playwright, Lighthouse — cannot be invoked directly, so the
  behavioral correctness of any code change cannot be verified this iteration.
- This iteration was therefore review-only: a full static read of
  `calculator-core.ts`, `workload-memory.ts`, `workload-sizing.ts`,
  `hardware.ts`, `report.ts`, `report-assumptions.ts`, `state.ts`,
  `numeric-state.ts`, and `workload-visibility.ts` found them conformant to the
  `specs/frontend.md` formulas (weights, precision map, per-family working
  memory, training state/activation, MoE speed, hardware tiers, overflow, fit,
  and assumption rows) with no correctness defect. Remaining unchecked
  `specs/frontend.md` items are the deferred styling pass and the
  Lighthouse/Playwright visual runs, neither actionable while execution is
  blocked.
- To unblock: a human must restore execution permissions (allow `pnpm` and
  `node <script>` in this session's allowlist) so the loop can run
  `pnpm preflight` and `pnpm gate` again.
- Existing unstaged human-owned forbidden edits remain in `PROMPT.md`,
  `harness/gate.ts`, and `harness/gate.test.ts`; agents must not stage or alter
  them.
