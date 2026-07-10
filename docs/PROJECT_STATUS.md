> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `c700864`.
- Commit: this commit.
- This iteration kept expanded `Advanced assumptions` inside the desktop input
  pane so it no longer intrudes into result details.
- Mobile keeps the viewport-width advanced panel so key controls remain visible.
- Added responsive browser coverage for the desktop advanced/result boundary.
- `specs/frontend.md` now records the advanced disclosure behavior as done.

## Checks

- Passed: `pnpm --prefix frontend run test:e2e -- responsive.spec.ts`
  (198 tests).
- Passed: `pnpm preflight`.
- `pnpm gate` is RED only on forbidden harness-owned coverage:
  `harness/cli.test.ts:798`.

## Blockers

- `pnpm gate` fails in forbidden `harness/cli.test.ts:798`: the pinned
  `claude` preset expects a trailing space entry but receives `dontAsk`.
- This commit includes a pre-existing forbidden `harness/gate.test.ts` cleanup
  auto-included by the harness; no forbidden path is currently dirty.

## Next

- Human should fix the forbidden harness preset expectation/implementation and
  rerun `pnpm gate`.
- Continue the remaining visual pass in `specs/frontend.md`.
- Revisit desktop no-scroll polish after the reference-note pass.
