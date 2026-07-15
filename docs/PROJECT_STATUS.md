> Handoff. Keep it short and current.

## State (2026-07-15)

- **F4 shipped:** the public title, H1, social title, app name, and
  WebApplication JSON-LD name now read
  "VRAM Calculator for LLMs, Diffusion & AI Models".
- Added crawlable below-main content: "How VRAM is calculated", the required
  formula, a 7B/13B/70B x FP16/8-bit/4-bit quick-reference table, seven visible
  FAQ items, and FAQPage JSON-LD mirroring the visible questions.
- The quick-reference table is static HTML but unit-tested against `buildReport`
  so the crawlable numbers stay equal to calculator output.
- F3 remains shipped: GGUF bpw tiers plus `INT2`/`INT3`, stable existing option
  values, and QLoRA pinned to existing `"4-bit"` NF4.
- Branch: `main` (already ahead of `origin/main` before this iteration).
  Commit: current-branch F4 shipment commit for this iteration.

## Checks

- Passed:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
  (134 tests).
- Passed: `pnpm preflight`.
- Passed: `pnpm gate`.

## Blockers

- None blocking F4 shipment.
- Remaining Phase 2 work is still unbuilt: F1 Hugging Face lookup, F2 layer
  offload output, F5 per-model pages, F6 static rental estimate, and F7 inverse
  mode.

## Next

- Return to the Phase 2 priority order in `specs/frontend.md`: F1 first, then
  F2 after F1 metadata exists.
- For F1, keep all network behavior mocked in unit tests; the gate must not hit
  Hugging Face.
- If touching docs again, keep agent-maintained markdown under 100 lines.
