> Handoff. Keep it short and current.

## State (2026-07-15, post-F0-deploy prep)

- **F0 activation fix is COMMITTED** on `main` as `0b80fa1` (fp16-equivalent
  decoder scratch, 0.5 GB floor, fp16 compute-precision assumption row,
  refreshed crawlable numbers). 273 unit tests, 100% coverage; preflight green.
- Production (`origin/main`) is still BEHIND local `main` — the F0/F3 work is
  committed locally but not deployed. Deploy is gated by the Release Rule (two
  high-level reviews) in `specs/frontend.md`.
- An adversarial edge-case audit + behavior-research pass ran; verdicts are
  recorded in `specs/frontend.md` under "Edge-Case Audit Verdicts". Net: ONE
  calc-layer fix warranted (relax the decimal-input cap to 2 places); every
  other finding is correct-but-silent or intentional — leave as-is.

## Uncommitted working tree (mixed authorship — needs owner triage)

Multiple in-flight changes sit together, NOT yet committed:

- **UI rework (partial, in `index.html` + `styles.css`):** "How VRAM is
  calculated" was moved into the right-column `.panel-group` as a 5th
  `.panel` after "Assumptions used". The old standalone `.seo-reference`
  block (old How-VRAM copy + the whole FAQ) is STILL PRESENT and must be
  deleted, along with the `FAQPage` JSON-LD in `<head>` and the now-unused
  `.seo-*`/`.faq-item` CSS. See F4.1 (owner revision) in `specs/frontend.md`.
  Owner mandate: FAQ removed for now; guide styling MUST match the app.
- **Context minimum (complete):** 256-token floor on `contextTokens` at both
  UI (`data-number-min="256"`) and calc layers (`workload-sizing.ts`
  `contextField`, used by `workload-memory.ts`); test added in
  `calculator.test.ts`; `app.test.ts:1157` sanitizer assertion updated to the
  floored value.
- **Pre-existing:** `app.ts`/`app-dom.ts` selector-gate refactor (behavior
  preserving); forbidden `harness/*` (cspell, preferences) — loop agents may
  not edit these.

## Known failing test (expected, tracks in-progress rework)

- `app.test.ts:478` "mirrors the visible FAQ in structured data" now fails
  (expects 7 visible FAQ questions, sees 0) because the FAQ markup is being
  removed. This test must be DELETED with the FAQ, not "fixed". Once the F4.1
  rework lands, this and the FAQ JSON-LD assertions go away together.

## Next (for loop agents / owner)

1. Finish F4.1: delete the standalone `.seo-reference` FAQ block + `FAQPage`
   JSON-LD + unused `.seo-*`/`.faq-item` CSS; remove FAQ-structure tests
   (incl. `app.test.ts:478`). Keep the relocated guide panel.
2. Apply the one calc fix: relax `isPlainDecimal` to accept 2 decimals; pin
   with a URL round-trip test.
3. Run `pnpm gate` green, then the two high-level reviews, then owner deploys.
