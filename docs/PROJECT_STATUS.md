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
  workload scaling inputs; malformed direct state shows resolved numeric
  fallbacks matching the formula inputs.
- `Known Model File Size` overrides QLoRA base model memory.
- Training activation memory uses family-specific workload proxies; shared
  workload sizing lives in `frontend/src/workload-sizing.ts`.
- Advanced numeric assumptions enforce real upper bounds in live form input and
  URL normalization (GPU resident fraction capped at `1`, LoRA trainable percent
  at `100`); direct state also caps LoRA percent at `100` and MoE active params
  at total params.
- Model-memory gating treats positive `Known Model File Size` as resident memory
  even with unknown total params; zero model memory suppresses workload-only
  activation/runtime/speed.

## Commands

- Focused report/app/calculator unit test:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts src/calculator.test.ts`
- Preflight: `pnpm preflight`
- Full gate: `pnpm gate`
- Full frontend coverage: `pnpm --prefix frontend run test:coverage`
- Build: `pnpm --prefix frontend run build`
- Playwright:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Lighthouse:
  `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`

## Checks

- Last green `pnpm gate` (before the execution blocker): format, lint,
  typecheck, schema, dependency checks, deadcode, spelling, workflow lint, SAST,
  secrets, audit, build, coverage, Playwright, and Lighthouse all passed.
- Pre-commit hook runs `harness preflight` (prettier, eslint, stylelint,
  html-validate) automatically on every commit; those stay covered.

## Blockers

- HARD BLOCKER (2nd consecutive iteration): the non-interactive permission
  policy denies direct code execution from Bash. Re-verified this iteration:
  `node --version` runs but `node -e ...` and `pnpm --version` both return "This
  command requires approval" and are auto-denied. So `pnpm preflight`, `pnpm
  gate`, vitest, typecheck, build, Playwright, and Lighthouse cannot be invoked;
  behavioral correctness of any code change cannot be verified.
- This iteration was review-only. A second independent fresh-context static read
  of `calculator-core.ts`, `workload-memory.ts`, `workload-sizing.ts`,
  `report-assumptions.ts`, and `numeric-state.ts` re-confirmed conformance to the
  `specs/frontend.md` formulas (weights/precision, per-family working memory,
  training state/activation, MoE speed rule, hardware tiers, fit math, clamps,
  and assumption rows) with no correctness defect. `README.md` is accurate and
  satisfies acceptance criterion 28.
- Remaining unchecked `specs/frontend.md` items are the deferred styling pass and
  the Lighthouse/Playwright visual runs. Styling is explicitly last and the owner
  reverts premature styling; the visual runs need execution. Neither is
  actionable while execution is blocked, so no safe verifiable code change is
  available.
- To unblock: a human must restore execution permissions (allow `pnpm` and
  `node <script>` in this session's allowlist) so the loop can run `pnpm
  preflight` and `pnpm gate` again.
- Existing unstaged human-owned forbidden edits remain in `PROMPT.md`,
  `harness/gate.ts`, and `harness/gate.test.ts`; agents must not stage or alter
  them.
