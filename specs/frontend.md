# Frontend Spec

## Priority

Ship a compact, trustworthy VRAM calculator today. Preserve the naming
contract in `specs/plan.md`, calculator correctness, accessibility, and the
current responsive behavior before doing cosmetic work.

### Inspect these examples and figure out if we can use them as examples to derive 'good' html / spacing standards.

- [ ] HTML reflects clean, compact, well-organized flow. Take learnings from inspecting these examples. Clean, compact, well-organized examples or what 'good' looks like to a human user are like these (you may inspect their HTML or styling online):
  - [ ] `spec/calc1.png` `docs/odoo.html`
  - [ ] `~/specs/calc2.png` `specs/dispel.html`
  - [ ] `spec/calc13.png` `specs/groundcover.html`

## Current Contract

- [ ] View the app while it is running in the browser. It does not look correct. Verify.
- [ ] The 'Reset' button should be centered relative to the 'VRAM Deployment Calculator' containter
- [ ] 'Advanced Assumptions' should be centered relative to the 'VRAM Deployment Calculator' containter
- [ ] The app follows `DESIGN.md` and `specs/this_png_shows_some_ideas_are_ok_not_all.png`
- [ ] The entire app fits without scrolling when all items are collapsed.
- [ ] The entire app fits wihout scorlling when all items are expanded.
- [ ] Elements are well-sized - not overly large.
- [x] Model cards like "Why this recommendation" do NOT look like buttons. They are text on a dark background with a standard downward arrow 'v' implying expansion, drawn from spacing tokens and inheriting the summary color (foreground, cyan when the panel is open).
- [x] Core calculations run in frontend TypeScript.
- [x] Public UI names follow the `specs/plan.md` Naming Contract.
- [x] Main controls are reactive; Reset is the only form action.
- [x] Context/KV controls are shown only for workloads that use them.
- [x] MoE active parameters appear only when MoE is checked and applicable.
- [x] Known Model File Size overrides parameter-derived resident weights.
- [x] Checkbox controls render empty unchecked indicators and checked marks.
- [x] Collapsed default state fits one viewport on desktop and mobile.
- [x] Playwright responsive coverage checks default, long workload names, and
      expanded advanced assumptions for horizontal overflow.
- [x] `Calculation used` renders the substituted calculation rows in order.
- [x] `Formula used` renders the symbolic equation separately from values.
- [x] Desktop result detail panels keep recommendation context wide while
      compacting calculation/formula summaries into the result grid.

## Remaining UI Work

- [ ] Final visual pass from the valid reference notes:
      `docs/odoo.html`, `specs/dispel.html`, `specs/groundcover.html`.
- [x] Calculator elements should remain compact, not oversized.
- [ ] Desktop should keep the two-pane input/result shape without page scroll
      where practical.
- [x] Expanded `Advanced assumptions` avoids clashing with result detail
      panels and stay usable on mobile.
- [ ] Cyan should remain limited to expanded result detail summaries.
- [ ] Result hero should look more professional while preserving hierarchy.
- [ ] Styling should continue to follow `specs/DESIGN.md`.

## Checks

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Required loop checks: `pnpm preflight`, then `pnpm gate` (only run once if you made significant changes, very slow on lighthouse).

## Notes

- The reference files are distilled notes, not raw third-party exports, so the
  repo-wide HTML validator can check them.
