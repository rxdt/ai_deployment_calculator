> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `f6e6a89`.
- Commits this iteration:
  - `7d36677` token chevron affordance on detail/advanced summaries.
  - `d5cdd60` unit coverage for the change-listener QLoRA exit guard.
- Chevron: detail-panel and Advanced-assumptions summaries now render a
  token-drawn downward "v" (spacing tokens, `currentcolor`) so they read as
  expandable text, not buttons. `display: flex` had suppressed the native
  triangle, leaving no expansion cue at all. It rotates up on open behind a
  `prefers-reduced-motion` guard. Added a `data-slot="why-panel"` hook so the
  e2e test toggles the panel without a banned `closest()` selector.
- Coverage: added a test firing a bare `precision` change event while in QLoRA;
  the change listener must run the same exit-to-inference reset as the input
  listener. This was the last uncovered branch (`app.ts:216`).

## Checks

- `pnpm preflight`: PASS.
- `pnpm gate`: PASS (0 issues, exit 0) — includes coverage 100%, e2e (204
  tests / 6 browsers), lighthouse.
- Frontend `test:coverage`: 100% statements/branches/functions/lines.

## Blockers

- None blocking the gate. The prior handoff's `harness/cli.test.ts:798` blocker
  is stale: the only globally-uncovered branch was `app.ts:216`, now closed.

## Notes

- The working tree still carries uncommitted edits to forbidden `harness/cli.ts`
  and `harness/cli.test.ts` (the branch's in-progress stub work). They are
  left for human review; the harness keeps forbidden paths out of commits. The
  gate above ran against that working tree, so re-run `pnpm gate` after those
  harness edits are committed or reverted.

## Next

- Remaining `specs/frontend.md` visual items: center Reset / Advanced
  Assumptions relative to the title container, no-scroll fit (collapsed and
  expanded), element sizing, and hero polish; verify the running app in-browser.
</content>
