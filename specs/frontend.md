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
- [x] A near-budget fit (>=95% of usable VRAM consumed, <=5% spare) turns the
      meter amber and leads the caption with "Tight fit:", so the warning never
      rests on color alone; comfortable fits keep the green bar.
- [x] One-click preset chips (Gemma 2B, Llama 8B, 70B, Mixtral) load a known
      deployment into the reactive form without submitting; they carry no green
      primary accent and Reset clears them back to the empty estimate.
- [x] The header brand reads like a shell prompt: green is reserved for the
      leading prompt marker (its "~") in its own element, so the primary accent
      never lands on the product name. The naming contract text is unchanged.
- [x] The hero answer cards carry a low-contrast, role-colored depth glow (green
      on the primary total card, blue on the alternate GPU-class card) that adds
      no layout box, so the one-viewport result stack is unaffected.
- [x] The page renders a command-center atmosphere behind the app: a faint cyan
      grid over low-contrast green/blue corner glows, composed as body
      background-image layers so it adds no layout box and never scrolls. The
      fake top nav stays translucent and applies a backdrop blur so the grid
      softens behind it; both are pure decoration and keep the calculator the
      focus.

## Remaining UI Work

- [ ] Final visual pass from the valid reference notes:
      `docs/odoo.html`, `specs/dispel.html`, `specs/groundcover.html`. Focus
      compact status, result-row polish, the hero fit meter (incl. its amber
      tight-fit signal), the compact breakdown stat cards, the preset chips, and
      the command-center background atmosphere plus translucent-blur nav are
      done; continue with only similarly scoped gaps.
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
