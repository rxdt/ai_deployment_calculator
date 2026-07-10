> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `f6e6a89`.
- Commit: this commit.
- Detail-panel and Advanced-assumptions summaries now render a token-drawn
  downward "v" chevron (spacing tokens, `currentcolor`) so they read as
  expandable text rather than buttons. `display: flex` had suppressed the native
  triangle, leaving no expansion affordance at all.
- The chevron rotates up when its panel is open; the rotation lives behind a
  `prefers-reduced-motion` guard.
- Added a cross-browser e2e test proving the marker is removed, the chevron is
  drawn, and it tracks the open state.
- `specs/frontend.md` records the "not-a-button + arrow" contract item as done.

## Checks

- Passed: `pnpm --prefix frontend run test:e2e` (204 tests, 6 projects).
- Passed: `pnpm preflight`.
- `pnpm gate` is RED only on forbidden harness-owned coverage:
  `harness/cli.test.ts:798`.

## Blockers

- `pnpm gate` fails in forbidden `harness/cli.test.ts:798`: the pinned `claude`
  preset expects a trailing space entry but receives `dontAsk`. Working-tree
  edits to `harness/cli.ts` / `harness/cli.test.ts` are forbidden-path and left
  for human review; the harness keeps them out of the commit.

## Next

- Human should fix the forbidden harness preset expectation/implementation and
  rerun `pnpm gate`.
- Remaining `specs/frontend.md` visual items: center Reset / Advanced
  Assumptions, no-scroll collapsed+expanded fit, element sizing, hero polish.
</content>
</invoke>
