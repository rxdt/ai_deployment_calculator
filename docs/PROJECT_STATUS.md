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
- `calculator.property.test.ts` now guards three non-negotiable Research
  Corrections with fast-check across random inputs (MoE never changes resident
  weight/required VRAM at inference, weight memory is monotonic in precision
  byte-width, known file size overrides parameter/precision weights). Frontend
  suite: 181 tests, 100% coverage.

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

- The prior "execution blocked" claim is FALSE and was removed. Verified green
  this iteration by actually running them: `node -e`, `pnpm`, `vitest`,
  `playwright`, and `lhci` all execute.
  - `pnpm preflight`: pass (prettier, eslint, stylelint, html-validate).
  - `pnpm --prefix frontend run test:coverage`: 181 tests pass, 100%
    statements/branches/functions/lines.
  - Playwright (`../harness/playwright.config.js`): 126 pass across all projects.
  - Lighthouse (`harness/lighthouserc.cjs`): all assertions pass, 3 runs.
  - Accuracy re-verified by hand-recomputing canonical cases from the spec
    formulas (8B default = 21.3 GB, 47B MoE active=1.3 = 113.1 GB); both match
    the code exactly. A formula-by-formula read of `calculator-core.ts`,
    `workload-memory.ts`, `workload-sizing.ts`, and `hardware.ts` found no
    correctness defect; every canonical test-case value is pinned in
    `calculator.test.ts`.
- Pre-commit hook runs `harness preflight` automatically on every commit; passes.

## Blockers

- `pnpm gate` is RED, but only because of human forbidden-path WIP: the
  uncommitted edit to `harness/cli.ts` changed the `AGENTS.claude` preset (now
  emits `--dangerously-skip-permissions`, `with`, and `--permission-mode
  dontAsk`) without updating `harness/cli.test.ts:798` ("pins agent presets"),
  which still expects the old 6-arg `--permission-mode acceptEdits` form. That
  single vitest assertion fails and the harness rejects the run before the
  Playwright/Lighthouse gate stages execute. Both files are forbidden
  (`harness/`), so an agent cannot reconcile them. All frontend gate stages that
  did run were green. To unblock: the owner reconciles `harness/cli.ts` and
  `harness/cli.test.ts`, then `pnpm gate` should pass end-to-end (frontend
  Playwright + Lighthouse already pass standalone).
- Styling already exists and is NOT deferred in the tree: `frontend/src/styles.css`
  is a committed 389-line dark design-system stylesheet whose tokens match
  `DESIGN.md` (`#09090B`/`#A1A1AA`/`#22C55E`/`#67E8F9`, Geist Variable, JetBrains
  Mono) with full component layout, imported by `main.ts`; responsive Playwright +
  axe + Lighthouse pass against it. `specs/frontend.md`'s Design Direction status
  note (committed in `65d2182`) already describes this accurately, but still frames
  the Lighthouse/Playwright visual verification as "execution-blocked" — false, as
  both run and pass this iteration. Remaining STYLING checkboxes are visual-polish/
  product decisions; not safe to change blind in an autonomous loop given the
  owner's revert history.
- No safe, non-manufactured code change was available: the calc/TS/HTML work is
  complete and verified green, styling exists, and the only red check is the
  forbidden-path harness mismatch above. Per loop rules, this iteration recorded
  verified truth instead of fabricating work.
- Unstaged human-owned forbidden edits remain and were left untouched:
  `PROMPT.md`, `harness/cli.ts`, `harness/gate.ts`, `harness/gate.test.ts`.
  Agents must not stage or alter these. (`specs/frontend.md` is no longer a
  working-tree edit; the prior iteration's spec correction is committed in
  `65d2182`.)
- Mechanism note for future iterations: `pnpm preflight` / `pnpm gate` invoke the
  harness, which stages allowed working-tree changes, contains forbidden paths,
  and creates a real commit under the git user's identity. Running them will
  commit your pending allowed edits — expect a new `HEAD` after either command.
