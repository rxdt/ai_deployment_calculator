> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `7f33b42`.
- Iteration scope: centered the Reset action and `Advanced assumptions` label
  relative to the input pane for the `VRAM Deployment Calculator` container.
- Markup: `Advanced assumptions` now has a stable summary slot while preserving
  the exact public label text.
- Styling: the action row spans the input pane and centers Reset; the advanced
  summary centers its label while keeping the token chevron on the right.
- Tests: added Playwright coverage that measures Reset and `Advanced
  assumptions` against the input-pane center. Existing responsive coverage still
  checks touch target size and no horizontal overflow.
- Specs: `specs/frontend.md` now marks Reset centering, Advanced assumptions
  centering, and cyan-limited detail summaries as complete.

## Checks

- `pnpm --prefix frontend test:e2e -- frontend/tests/responsive.spec.ts`: PASS
  (210 tests).
- `pnpm --dir frontend exec vitest run src/app.test.ts --config
  ../harness/vitest.config.js`: PASS (54 tests).
- `pnpm preflight`: PASS.
- `pnpm gate`: PASS (0 issues, includes coverage, e2e, and Lighthouse).

## Blockers

- Remaining mobile visual work still needs an owner decision: keep the current
  two-pane, one-viewport mobile contract, or allow a stacked mobile layout with
  vertical scroll for readability.
- The full visual pass remains open because the no-scroll/readability tradeoff
  above controls how much the result pane can be rebalanced.

## Next

- Resolve the mobile no-scroll/readability direction before changing the layout
  contract.
- Continue the result hero visual pass after that direction is settled.
