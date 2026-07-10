> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `b8e904b`.
- Iteration scope: begin the professional-calculator-redesign by surfacing the
  concrete recommended-GPU examples the app already computes but was discarding.
- Feature: the "Why this recommendation" panel now lists an "Example GPUs" row
  (e.g. `RTX 3090 / RTX 4090 class`) sourced from the recommended
  `HardwareTier.examples`. The row hides when there is no single-card fit (no
  model loaded, or an overflow recommendation).
- Refactor: pure result-string helpers (`recommendedGpuClass`, `gpuExamples`,
  `whyText`, `formatSpeed`, `speedLabel`) moved from `app.ts` into a new
  `frontend/src/result-format.ts` to keep `app.ts` under the 300-line cap and
  give the presentation logic a testable home.
- Design bundle relocated: the untracked `professional-calculator-redesign`
  handoff (a raw claude.ai/design export with `{{ }}` templates + inline styles
  + upload `.ts`) was moved from `specs/` to `scratchpad/`. It cannot pass
  `eslint .` / `html-validate`, and those checks walk the whole tree; `scratchpad/`
  is git-ignored and excluded from every linter. `specs/frontend.md` now points
  at the new location.

## Checks

- `pnpm --dir frontend test:coverage`: PASS (197 tests, 100% stmts/branch/func/line).
- `pnpm preflight`: PASS (0 issues).
- `pnpm gate`: see the run at the end of this iteration.

## Blockers

- The redesign's marquee additions that grow the input pane (presets row, HUD
  status strip) or add a note to the narrow secondary hero card are effectively
  blocked on the same unresolved mobile owner-decision below: the responsive
  suite asserts the collapsed default fits one 390x844 viewport, and the repo's
  defensive-CSS policy forbids `overflow: hidden`/`clip`, so an unbounded
  wrapping note in the ~60px secondary column risks the no-scroll contract. This
  iteration deliberately placed the GPU examples inside the collapsed, full-width
  "Why" panel to stay clear of that contract.
- Remaining mobile visual work still needs an owner decision: keep the current
  two-pane, one-viewport mobile contract, or allow a stacked mobile layout with
  vertical scroll for readability.
- If the raw design bundle is re-dropped into `specs/` (not `scratchpad/`), it
  will re-break `eslint .` and `html-validate`; the durable fix (a `specs/**`
  globalIgnore) lives in the forbidden `harness/` config.

## Next

- Resolve the mobile no-scroll/readability direction, then bring the presets row
  and HUD status strip over from the design bundle.
