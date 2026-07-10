# Frontend Spec

## Priority

Ship a compact, trustworthy VRAM calculator today. Preserve the naming
contract in `specs/plan.md`, calculator correctness, accessibility, and the
current responsive behavior before doing cosmetic work.

### Inspect these examples and figure out if we can use them as examples to derive 'good' html / spacing standards.

- [ ] Implement this within our ruleset and linting `scratchpad/professional-calculator-redesign` and `specs/Screenshot 2026-07-09 at 11.23.19 PM.png` Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
      https://claude.ai/design/p/b368203b-856d-480e-8103-b1977a6fe1a3?file=VRAM+Calculator.dc.html. Implement: VRAM Calculator.dc.html

The design bundle is a raw claude.ai/design export (`{{ }}` templates, inline
styles, upload `.ts`) and cannot pass `eslint .` or `html-validate`. It lives
under `scratchpad/` (git-ignored, excluded from every linter) rather than the
linted `specs/` tree; reference it there and do not commit it as source.

- [x] Surface the recommended tier's concrete example GPUs (already computed in
      `hardware.ts`, previously discarded) inside the "Why this recommendation"
      panel so engineers can see which cards fit the estimate.

- [x] Make the single-GPU overflow recommendation actionable: when a workload
      exceeds every single-GPU tier but a sharded tier would fit once sharding is
      enabled, name that tier and its GPU count instead of dead-ending at "Enable
      memory sharding or use offload".

- [x] Stop the "Recommended GPU Class" card from flattening a sharded tier to
      "160 GB GPU hardware tier" (implying a single 160 GB card). Keep the
      "sharded" qualifier so the hero matches the multi-GPU examples row.

- [x] For sharded fits, word the "Why this recommendation" panel as an
      aggregate sharded GPU pool instead of "a GPU" with aggregate VRAM.

## Current Contract

- [x] The entire app avoids page scrolling when all items are collapsed.
- [x] The entire app avoids page scrolling when all items are expanded.
- [ ] Elements are well-sized - not overly large.
- [x] Model cards like "Why this recommendation" do NOT look like buttons. They are text on a dark background with a standard downward arrow 'v' implying expansion, drawn from spacing tokens and inheriting the summary color (foreground, cyan when the panel is open).

## Remaining UI Work

- [ ] Final visual pass from the valid reference notes:
      `docs/odoo.html`, `specs/dispel.html`, `specs/groundcover.html`.
- [x] Desktop should keep the two-pane input/result shape without page scroll
      where practical.
- [ ] Cyan should remain limited
- [ ] Result hero should look more professional while preserving hierarchy.
- [ ] Styling should continue to follow `specs/DESIGN.md`.

## Checks

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Required loop checks: `pnpm preflight`, then `pnpm gate` (only run once if you made significant changes, very slow on lighthouse).

## Notes

- The reference files are distilled notes, not raw third-party exports, so the
  repo-wide HTML validator can check them.
