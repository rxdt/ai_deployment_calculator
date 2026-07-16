codex-frontend-1/1 is working on decimal input cap in this spec

# Frontend Spec

---

MUST FILL IN LINE 9 AT START THEN "CLEAR" BACK TO BASELINE BEFORE END OF ITERATION

> CLAIMED BY AGENT:

< agent >< iteration >< run > is working on < list tasks in this spec you choose >

MUST FILL IN LINE 9 AT START THEN "CLEAR" BACK TO BASELINE BEFORE END OF ITERATION

---

## Priority

Phase 1 is shipped and live at https://vram.rxdt.dev/; Phase 2 F0/F3/F4/F4.1
have landed. The F1/F2/F5/F6/F7/F8 feature backlog is PARKED (owner directive
2026-07-16 — do not build; archived at
`scratchpad/DO-NOT-DO-phase2-features.md`). Only actionable work now: the
decimal-input fix (see Edge-Case Audit Verdicts) and the recurring QA runs
F9/F10 (`specs/qa.md`, `specs/plan.md`).

## Shared Rules

- Calculations stay in `calculator-core.ts`, `workload-memory.ts`, and
  `report.ts`.
- UI copy must not imply the tool is LLM-only.
- Existing preset and URL-state behavior must keep working; tests pin it.
- Match existing file structure, tokens, and comment voice.
- `app.ts` is near the 300 code-line cap; new DOM helpers belong in
  `app-dom.ts` with exported JSDoc.
- Numeric input precision: numeric fields accept UP TO 2 decimal places on
  input (`step=0.01`), needed for values like `gpuResidentFraction` (0.85) and
  `loraTrainablePercent` (0.05%). This relaxes the current 1-decimal input cap
  in `numeric-state.ts`. GB / memory OUTPUTS stay displayed at 1 decimal place.
  Rationale: a competitor survey found free fine-grained inputs cap at
  `step=0.01` (2 decimals); 1-decimal GB display is acceptable though slightly
  coarser than the 2-decimal peer norm.
- SEO rule (any crawlable content): static client-side app, so only served HTML
  counts. Keep a single H1 (hero); content in closed `<details>` is still
  indexed (mobile-first). Do NOT use `FAQPage` schema (Google removed the FAQ
  rich result, May 2026) — write any Q&A as ordinary crawlable
  prose/subheadings mirroring real queries ("how much VRAM for a 70B model",
  "GPU memory for LoRA/QLoRA"). The 7B/13B/70B × FP16/8-bit/4-bit table (pinned
  to `buildReport`) is the strongest asset. Match `.panel` styling — no bespoke
  SEO CSS.

## Visual Verification Rule (owner mandate, 2026-07-15)

Any UI-affecting change needs screenshots, not just tests/typecheck. Start the
app and capture multiple states (default, computed, panels open/closed, zeroed,
extreme), multiple viewports (320/390px mobile, tablet, desktop), and varied
inputs. Report: no visual breakage/overlap/horizontal scroll, output numbers
spot-check against formulas/anchors, styling consistent. Save screenshots; no
screenshots means not verified.

## Release Rule (owner mandate, 2026-07-15)

Production deploy only after, in order: automated gate green (lint, type-check,
build, coverage, E2E, Lighthouse), one high-level Claude review, one high-level
Codex review. High-level means whole-delta judgment: numbers against anchors,
user-facing copy, and recommendation behavior, not another lint run. Owner
pushes.

## Edge-Case Audit Verdicts (2026-07-15)

Audit of the MoE / LoRA / training / fraction fields + correctness research.
Fix ONE thing; the rest are correct-but-silent or intentional — do NOT change.

- **FIX — decimal input cap (`numeric-state.ts` `isPlainDecimal`).** The
  1-decimal cap silently reverts 2-decimal URL/field values (e.g.
  `gpuResidentFraction=0.75` → `1.0`, max memory — the worst silent flip).
  Relax to 2 decimals per the Numeric-input-precision rule; pin with a URL
  round-trip test. Only calc-layer change the audit warrants.
- **LEAVE AS-IS (silent but correct):** MoE `activeParams=0`/blank → dense
  total (0 is never valid MoE; safest number); `gpuResidentFraction` applies
  only on the known-file path (scaling the param path would break KV/activation
  coherence — a labeling issue, not math); `fraction=0`+known-file → 0 GB;
  `loraTrainablePercent`≤100; known-file bypasses QLoRA-4-bit / full-training
  formulas; `activeParams`≤`total`. Each is a physically-correct clamp — no
  code change.

## Loop Discipline (finish, don't dally)

1. Pick the first actionable Phase 2 item whose dependencies are met; one per
   run.
2. Done means contract met, `pnpm gate` exits 0, plan/spec/status shrink to the
   truth, and work is committed.
3. No drive-by refactors, renames, style migrations, or scope extension. Log
   unrelated issues in `docs/LAUNCH_TODO.md`.
4. If the same gate check fails 3 times, stop and write symptom, attempts, and
   hypothesis under `## Blockers`.
5. Never edit another feature's primary files or `harness/` config unless the
   contract explicitly says so.

## Checks / Gate Landmines

- Focused: `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`.
- Full units: `pnpm --dir frontend run test:coverage`; final: `pnpm gate`.
- Gate rejects linter-disable comments, TypeScript ignore comments, exclusive
  test markers, skipped tests, and broad suppression. TS lint bans unsafe `as`.
- Stylelint dislikes qualifying selectors + descending specificity.
- Playwright `getByLabel("Precision")` needs `{ exact: true }`.
