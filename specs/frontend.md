# Frontend Spec

## Priority

Ship a compact, trustworthy VRAM calculator today. Preserve the naming
contract in `specs/plan.md`, calculator correctness, accessibility, and the
current responsive behavior before doing cosmetic work.

## Current Contract

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

## Remaining UI Work

- [ ] Final visual pass from the valid reference notes:
      `docs/odoo.html`, `specs/dispel.html`, `specs/groundcover.html`.
- [ ] Calculator elements should remain compact, not oversized.
- [ ] Desktop should keep the two-pane input/result shape without page scroll
      where practical.
- [ ] Expanded `Advanced assumptions` should avoid clashing with result detail
      panels and stay usable on mobile.
- [ ] Cyan should remain limited to expanded result detail summaries.
- [ ] Result hero should look more professional while preserving hierarchy.
- [ ] Styling should continue to follow `specs/DESIGN.md`.

## Formula Smoke Tests

- [x] 8B text-generation inference, 8000 ctx, 16-bit, server: 21.3 GB.
- [x] 47B MoE inference keeps resident weights independent of active params.
- [x] 8B QLoRA uses quantized base plus adapter states, not flat overhead.
- [x] 7B full training includes weights, master weights, gradients,
      optimizer, activations, overhead, and buffer.
- [x] 104B GGUF local exact resident size uses file-size override.

## Checks

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Focused browser loop:
  `pnpm --prefix frontend run test:e2e -- calculator.spec.ts`
- Required loop checks: `pnpm preflight`, then `pnpm gate`.

## Notes

- The reference files are distilled notes, not raw third-party exports, so the
  repo-wide HTML validator can check them.
