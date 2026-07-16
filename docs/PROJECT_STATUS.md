# Project Status

Short, current handoff. Deleted lines are the point — keep only what's useful now.

## State (2026-07-16)

- Committed on `main`: F0 activation fix (`0b80fa1`), then bug-fix batch
  (`a06f2dd`) carrying the F4.1 UI rework, the 256-token context floor, and
  spec cleanup. 274 unit tests, 100% coverage; build green.
- **F4.1 done:** FAQ section + FAQPage JSON-LD removed; "How VRAM is
  calculated" relocated into the reasoning `.panel-group` (shared `.panel`
  styling, green chevron); bespoke `.seo-*`/`.faq-item` CSS gone; hero subtitle
  width now uses the `--layout-intro-max` token.
- Current run pinned F4.1 behavior: fifth guide panel order/closed state,
  keyboard Enter toggle, hidden-then-open guide table, and Total Model
  Parameters staying a free-form text input.
- Production is BEHIND `main` (not yet deployed). Deploy is gated by the
  Release Rule (gate + Claude review + Codex review) in `specs/frontend.md`.

## Checks

- `pnpm preflight` passed.
- `pnpm gate` passed.
- Focused: `vitest src/app.test.ts` passed 110 tests; affected Playwright specs
  passed 314 tests / 10 skipped.
- Visual screenshots saved in `scratchpad/visual-f4.1/`: default closed
  (18.8 GB), 70B 8-bit open guide (87.7 GB), 390px zeroed (0.0 GB), 320px 13B
  4-bit guide (11.9 GB), tablet 104B extreme (237.3 GB). Script checked no
  horizontal overflow for each.

## Open work

- **Decimal-input fix (only calc change the audit warrants):** relax
  `numeric-state.ts` `isPlainDecimal` to accept 2 decimals so
  `gpuResidentFraction=0.75` etc. don't silently revert; pin with a URL
  round-trip test. Details in `specs/frontend.md` "Edge-Case Audit Verdicts".
- **Phase 2 feature backlog (F1/F2/F5/F6/F7/F8) is PARKED** — do not build
  (archived at `scratchpad/DO-NOT-DO-phase2-features.md`). Recurring QA runs
  F9/F10 remain actionable (`specs/qa.md`).

## Blockers

- None open.

## Known issues

- Small-screen topbar polish around GitHub/brand wrapping is pre-existing, not
  from F4.1. Logged in `docs/LAUNCH_TODO.md` (section 4).
