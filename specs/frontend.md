# Frontend Spec

## Priority

Ship a compact, trustworthy VRAM calculator today. Preserve the naming
contract in `specs/plan.md`, calculator correctness, accessibility, and the
current responsive behavior before doing cosmetic work.

### Inspect these examples and figure out if we can use them as examples to derive 'good' html / spacing standards.

- [ ] Implement this within our ruleset and linting: `scratchpad/professional-calculator-redesign` and `specs/Screenshot 2026-07-09 at 11.23.19 PM.png` and `scratchpad/professional-calculator-redesign/project/screenshots/Screenshot 2026-07-10 at 12.29.26 AM.png`. Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project: https://claude.ai/design/p/b368203b-856d-480e-8103-b1977a6fe1a3?file=VRAM+Calculator.dc.html. Implement: VRAM Calculator.dc.html

The design bundle is a raw claude.ai/design export (`{{ }}` templates, inline
styles, upload `.ts`) and cannot pass `eslint .` or `html-validate`. It lives
under `scratchpad/` (git-ignored, excluded from every linter) rather than the
linted `specs/` tree; reference it there and do not commit it as source. Use it as the style/html/javascript to copy from.

## Current Contract

- [x] The entire app avoids page scrolling when all items are collapsed.
- [x] The entire app avoids page scrolling when all items are expanded.
- [x] Elements are well-sized - not overly large.
- [x] Keyboard focus uses the cyan token on controls and disclosures without
      changing control size.
- [x] Header shows a compact live model/mode/precision/fit summary.
- [x] Expanded result detail rows keep labels/values aligned within the current
      responsive overflow contract; warning rows stay readable as prose.
- [x] The hero shows an at-a-glance fit meter: a slim green usage bar plus a
      plain-language "Fits a N GB card with N GB usable headroom (N% spare)"
      caption. The bar hides and the caption falls back to the raw need when no
      single class fits (no model, overflow, or sharded pool without a fit).

## Remaining UI Work

- [ ] Final visual pass from the valid reference notes:
      `docs/odoo.html`, `specs/dispel.html`, `specs/groundcover.html`. Focus
      compact status, result-row polish, the hero fit meter, and the compact
      breakdown stat cards are done; continue with only similarly scoped gaps.
      The preset chips (Llama 8B, 70B, Mixtral, ...) remain unbuilt.
- [x] The computed memory breakdown (model memory / context / activation /
      training / runtime reserve / safety margin) renders as compact bordered
      stat cards inside a collapsed "Memory breakdown" disclosure. The panel
      fills the empty grid cell beside "Assumptions used" so it adds no new
      collapsed row to the one-viewport result stack; zero-GB components and the
      no-model state drop their cards.
- [x] Cyan remains limited to focus and expanded detail-panel state.
- [x] Result hero uses compact raised answer cards while preserving hierarchy.
- [ ] Styling should continue to follow `specs/DESIGN.md`.

## Checks

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Required loop checks: `pnpm preflight`, then `pnpm gate` (only run once if you made significant changes, very slow on lighthouse).

## Notes

- The reference files are distilled notes, not raw third-party exports, so the
  repo-wide HTML validator can check them.
