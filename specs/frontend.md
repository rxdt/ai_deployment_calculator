codex-gpt5 is working on F4.1 relocate guide/drop FAQ in this spec

# Frontend Spec

## Priority

Phase 1 is shipped and live at https://vram.rxdt.dev/; Phase 2 F0/F3/F4/F4.1
have landed. Remaining features (F1, F2, F5, F6, F8, F7) have contracts in
`specs/contracts.md` and rationale in `specs/plan.md` — take one per run,
gate-green after each, strike it when done, delete `contracts.md` when empty.

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

## Visual Verification Rule (owner mandate, 2026-07-15)

Any UI-affecting change MUST be visually verified before it is called done —
tests and typecheck are not enough. The agent starts the app (dev server or
built `dist` via Playwright under `harness/`) and screenshots it:

- Multiple STATES: default load, a computed result, panels/disclosures open
  and closed, an empty/zeroed form, an extreme-input result.
- Multiple VIEWPORTS: mobile (320 / 390px), tablet, desktop. No horizontal
  scroll at 320/390; no label overlap at ≤30em.
- Various calculator INPUTS across families/modes/precisions.

For each, verify three things and report them: (1) the app LOOKS ok (nothing
visually broken, clipped, overlapping, or unstyled); (2) the OUTPUT numbers are
accurate (spot-check against the formula/anchors, not just "a number appeared");
(3) styling is CONSISTENT across viewports and no element renders "broken"
(mis-aligned chevron, wrong font, spacing unlike the rest of the app, off-theme
color). Attach/save screenshots to the run's report; a claim of "verified"
without screenshots is not verified.

## Release Rule (owner mandate, 2026-07-15)

Before deploying to production, a change must pass TWO independent high-level
reviews — one by Claude and one by Codex — in addition to the automated gate.
A deploy (push to main) happens only after, in order: (1) the automated gate
green (lint, type-check, build, coverage, E2E, Lighthouse), (2) one HIGH-LEVEL
review by Claude, (3) one HIGH-LEVEL review by Codex. High-level means
whole-delta judgment — correctness of the numbers against anchors, user-facing
copy, recommendation behavior changes — not a lint re-run. Reviews go to the
owner; the owner pushes.

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

1. Pick the FIRST unchecked feature in `specs/plan.md` Phase 2 whose
   dependencies are met. One feature per run — never two.
2. Read Gate Landmines below BEFORE writing code; every landmine has already
   cost a full debugging cycle once.
3. Definition of done, all four or it is not done: (a) the contract below is
   met exactly; (b) `pnpm gate` exits 0; (c) the item is struck `[x]` in
   `specs/plan.md` with a one-line DONE note; (d) work is committed with a
   descriptive message.
4. No drive-by refactors, no renames, no style migrations, no scope
   extensions outside the feature's contract. If you see an unrelated
   problem, append one line to `docs/LAUNCH_TODO.md` and keep moving.
5. If the same gate check fails 3 consecutive attempts, STOP: revert to the
   last green state, write the blocker (symptom, attempts, hypothesis) under
   a `## Blockers` heading in `specs/plan.md`, and end the run. Thrashing
   burns the budget the next feature needs.
6. Never edit another feature's primary files in the same run; never touch
   `harness/` config except where a contract explicitly says so.
