> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`.
- Iteration 3/5 scope: continue the DESIGN.md visual pass with two similarly
  scoped, one-viewport-safe gaps the reference shows but the app still lacked.
- Brand prompt marker: the header brand wraps its leading `~` in a `.brand-mark`
  element the stylesheet greens, so the primary accent lands only on the prompt
  marker, never the product name (DESIGN.md nav language). `brand.textContent`
  stays `~VRAM-calculator`, so the naming contract and its test are unchanged.
- Hero depth glow: `.hero` and `.hero--secondary` gain a low-contrast,
  role-colored glow (green primary total, blue alternate GPU class) via new
  `--color-glow-*` tokens. The glow is a soft halo with no layout box, so the
  all-collapsed / all-expanded no-scroll contract is unaffected.

## Also landed (prior iterations)

- Amber tight-fit meter, static-HTML preset chips, downward advanced overlay,
  compact breakdown stat cards, compact status strip. All green at HEAD.

## Checks

- `pnpm --prefix frontend run test:coverage`: PASS — 100% statements / branches /
  functions / lines held (the brand test is additive).
- Playwright `calculator.spec` + `responsive.spec`: PASS (240), incl. every
  all-collapsed / all-expanded no-scroll contract and the hero fit-meter case.
- `pnpm preflight`: PASS (0 issues) — prettier, eslint, stylelint, html-validate.
- `pnpm gate`: PASS (0 issues) — glow and marker add no layout box, so CLS and
  the no-scroll contract held; Lighthouse stayed green.

## Blockers

- The claude_design MCP import in `specs/frontend.md` stays blocked: the
  `design` MCP server surfaces tools but is unauthenticated, and `/design-login`
  needs interactive auth unavailable in this run.
- `PROMPT.md` is a forbidden path for agents; its edits are left for human
  review and kept out of agent commits.

## Next

- Remaining spec item is the ongoing general visual pass against `docs/odoo.html`,
  `specs/dispel.html`, `specs/groundcover.html` under `specs/DESIGN.md`. The
  named reference gaps are done; the leftover DESIGN.md touches (faint cyan grid
  / scanline background, backdrop blur) are optional ("may"/"can") pure-CSS
  decoration with no behavioral surface to unit-test — pick only similarly
  scoped gaps that preserve the one-viewport no-scroll contract.
