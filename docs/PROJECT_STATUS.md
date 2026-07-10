> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`.
- Iteration 4/5 scope: land the DESIGN.md "Elevation & Depth" atmosphere the app
  still lacked — the faint cyan grid + green/blue corner glow background and the
  translucent-blur nav — as pure decoration that preserves the one-viewport
  no-scroll contract.
- Background atmosphere: `body` layers two token-driven background-images — a
  faint cyan grid (`--background-grid` over `--color-grid-line`) and low-contrast
  green/blue corner glows (`--background-glow` over `--color-glow-ambient-*`).
  Backgrounds add no layout box and never generate scrollbars, so the collapsed
  and all-expanded no-scroll contracts hold. Grid shows only through card gaps.
- Nav blur: `.topbar` keeps its translucent `--color-topbar` fill and adds
  `backdrop-filter: blur(var(--space-md))` so the grid softens behind it. Blur is
  a progressive enhancement (vendor prefixes are lint-banned); the translucent
  fill carries the effect where `backdrop-filter` is unsupported.

## Also landed (prior iterations)

- Brand prompt marker (green only on the `~`), hero role-colored depth glow,
  amber tight-fit meter, static-HTML preset chips, downward advanced overlay,
  compact breakdown stat cards, compact status strip. All green at HEAD.

## Checks

- Playwright `responsive.spec`: PASS (150) across desktop / desktop-safari /
  iphone / tablet, incl. the new "decorative atmosphere stays behind content"
  case (translucent blurred nav + layered grid/glow background + no page scroll)
  on both one-viewport breakpoints, and the axe scan (no contrast regression).
- `pnpm preflight`: PASS (0 issues) — prettier, eslint, stylelint, html-validate.
- CSS bundle 12.2 kB, under the 13 kB size budget.
- `pnpm gate`: PASS (0 issues) — decoration is CSS-only + one additive e2e, so
  100% coverage held and Lighthouse stayed green; backgrounds add no layout box,
  so CLS and the no-scroll contract were unaffected.

## Blockers

- The claude_design MCP import in `specs/frontend.md` stays blocked: the
  `design` MCP server surfaces tools but is unauthenticated, and `/design-login`
  needs interactive auth unavailable in this run.
- `PROMPT.md` is a forbidden path for agents; its edits are left for human
  review and kept out of agent commits.

## Next

- Remaining spec item is the ongoing general visual pass against `docs/odoo.html`,
  `specs/dispel.html`, `specs/groundcover.html` under `specs/DESIGN.md`. The
  named reference gaps, the faint cyan grid / green-blue glow background, and the
  backdrop-blur nav are now done. The last leftover DESIGN.md touch is the
  optional ("may") scanline texture — pure-CSS decoration with no behavioral
  surface to unit-test; pick only similarly scoped gaps that preserve the
  one-viewport no-scroll contract.
