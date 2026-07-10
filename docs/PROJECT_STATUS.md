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

## In-browser verification (this iteration)

Ran the dev app and screenshotted desktop (1280) and mobile (390):

- Chevron confirmed in-browser: closed summaries show a down "v"; open result
  panels rotate to a clean cyan "^". Works desktop + mobile.
- Desktop layout reads clean and on-brand.
- Mobile (390px) `Recommended GPU Class` and the `Calculation/Formula used`
  summaries shatter into 1–2 char-per-line wraps. Root cause: the two-pane
  layout only stacks at `@media (width <= 22em)` (352px), so real phones keep a
  cramped two-column grid. This is INTENTIONAL — `responsive.spec.ts`'
  `collapsed default estimate fits one viewport on mobile` requires every result
  summary to stay in-viewport at 390px, which only holds with two columns.
  Fixing readability by stacking earlier would break that locked contract.

## Open question for the owner (blocks the new spec items)

`specs/frontend.md` now asks to "center Reset / Advanced Assumptions relative to
the 'VRAM Deployment Calculator' container" and says the app "does not look
correct." Two things need a decision before I change layout:

1. Reference frame for "the container": the input pane (half width), the full
   page, or the title block? `justify-content` differs per answer.
2. Mobile readability vs the no-scroll contract above — these conflict. Pick one:
   keep two-pane-fits-one-viewport (accept cramped mobile), or allow mobile
   scroll for a stacked, readable layout (and relax the mobile in-viewport test).

## Next

- Owner to answer the two questions above; then implement centering + the
  mobile layout direction, updating `responsive.spec.ts` to match the chosen
  contract.
- Remaining `specs/frontend.md` visual items: no-scroll fit, element sizing,
  hero polish.
</content>
