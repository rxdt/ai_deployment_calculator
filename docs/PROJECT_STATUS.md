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
- `calculator.property.test.ts` now guards the non-negotiable Research
  Corrections with fast-check across random inputs: MoE never changes resident
  weight/required VRAM at inference, weight memory is monotonic in precision
  byte-width, known file size overrides parameter/precision weights, and decoder
  KV required VRAM never decreases as context length, concurrency, or KV precision
  byte-width grows. New this iteration: text-encoder required VRAM is invariant to
  KV precision (no persistent generation KV), QLoRA weight memory is the frozen
  4-bit base scaled by params regardless of the precision control (no flat 4 GB),
  and full training strictly exceeds LoRA/QLoRA required VRAM. New this iteration:
  full training reports a training-buffered (1.25) four-part total (weights +
  training state + activations + runtime overhead), each omitted-by-the-shortcut
  term strictly positive, and strictly exceeds the discredited `Total_Params_B * 16`
  shortcut across every precision — the one "Do Not Restore" formula that previously
  had only the single 7B canonical case, now generalized. `confidence.test.ts`
  pins the confidence-label mapping (diffusion/video/custom -> `Rough`, else
  `Estimated`, always non-empty). Also new: `hardwareRecommendation` now has an
  end-to-end property guard that the recommended tier's displayed fit headroom is
  never negative (the spec's "Fit_Headroom_GB >= 0 by construction"), covering the
  tier pick + utilization multiply + formatting and the `(required/u)*u` float path
  (never renders "-0.0 GB"); 200 runs surfaced no undershoot. Frontend suite: 190
  tests, 100% coverage. All six new invariants were mutation-verified (each fails on
  a broken source): the `Total_Params_B * 16` guard against both a dropped-activation
  and a literal shortcut mutation, the fit-headroom guard against an inverted
  minimum-raw-VRAM derivation.

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
  - `pnpm --prefix frontend run test:coverage`: 190 tests pass, 100%
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

- `pnpm gate` is RED, but only because of human forbidden-path WIP. Confirmed
  this iteration by running the single assertion: `harness/cli.ts` changed the
  `AGENTS.claude` preset (now emits `--dangerously-skip-permissions`, `with`, and
  `--permission-mode dontAsk`) while `harness/cli.test.ts:798` ("pins agent
  presets") still deep-equals the old `--permission-mode acceptEdits` array
  (`npx vitest run harness/cli.test.ts -t "pins agent presets"` fails: "expected
  [ 'claude', '-p', …(8) ] to deeply equal [ 'claude', '-p', …(6) ]"). The gate's
  `coverage` stage runs the combined harness+frontend vitest suite
  (`harness/vitest.config.js`, see `harness/gate-data.ts:252`), so that one failing
  harness assertion turns the gate RED before Playwright/Lighthouse run. Both files
  are forbidden (`harness/`), so an agent cannot reconcile them. To unblock: the
  owner reconciles `harness/cli.ts` and `harness/cli.test.ts`.
- Separately, the uncommitted `harness/gate.ts` + `harness/gate.test.ts` WIP is
  self-consistent (empty-commit-after-containment is now a stderr warning, not a
  preflight failure) and does NOT block: `pnpm preflight` passes with 0 issues this
  iteration even when only forbidden paths are staged. This is a behavior change
  from the prior handoff, which reported preflight rejecting empty commits.
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
- This iteration's safe code change: added the generalized `Total_Params_B * 16`
  full-training guard (see State) — the last "Do Not Restore" formula lacking a
  property-level guard. The calc/TS/HTML work was already complete and verified
  green (189 frontend tests, 100% coverage, preflight 0 issues); the only red check
  is the forbidden-path harness mismatch above. Remaining unfinished spec items are
  visual STYLING polish (owner-gated per revert history) and the forbidden-path
  harness reconcile.
- Unstaged human-owned forbidden edits remain and were left untouched:
  `PROMPT.md`, `harness/cli.ts`, `harness/gate.ts`, `harness/gate.test.ts`.
  Agents must not stage or alter these. (`specs/frontend.md` is no longer a
  working-tree edit; the prior iteration's spec correction is committed in
  `65d2182`.)
- Mechanism note for future iterations (observed this iteration): running
  `pnpm preflight` / `pnpm gate` directly runs the checks and forbidden-path
  containment but does NOT create a commit — `HEAD` was unchanged after both.
  Commits happen when you run `git commit`; the pre-commit hook then runs
  `harness preflight`, drops any staged forbidden paths, and flags banned patterns.
  Stage only your intended files so forbidden-path WIP stays out of the commit.
