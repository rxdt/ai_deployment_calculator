# Project Status

Short, current handoff. Deleted lines are the point — keep only what's useful now.

## State (2026-07-16)

- `main` includes the Phase 2 F0/F3/F4/F4.1 work plus the decimal-input fix
  (`d5cbaf0`): URL normalization and decimal text inputs now preserve up to 2
  decimal places, including `gpuResidentFraction=0.75` and
  `loraTrainablePercent=0.05`.
- `main` also includes the T3 decoder activation fix (`3d40a46`): inference
  scratch now follows llama.cpp 70B 8k/32k compute-buffer anchors, so
  `?total-params=70` is 161.1 GB and 70B@32k is no longer context-flat.
- `specs/frontend.md` had no remaining frontend build work after that fix, so
  it was deleted. Active work is now the owner-gated redeploy/verification in
  `specs/accuracy-fix.md` plus recurring QA in `specs/qa.md`/`specs/plan.md`.
- Current QA run seeded `frontend/src/adversarial/oracle.test.ts` and
  `docs/qa/adversarial-2026-07-16.md` with PB-scale URL, published bpw,
  training-order, no-KV, and URL-extreme invariants.
- Hardware-tier green-check QA is covered by Playwright (`0b8c598`): default
  24 GB, 70B 192 GB, overflow, and reset states keep the correct visible marker
  across all configured browser projects/viewports.
- Production is BEHIND `main` (not yet deployed). Deploy still needs automated
  gate green, one high-level Claude review, and one high-level Codex review;
  owner pushes.

## Checks

- `pnpm preflight` passed after T3.
- Full frontend coverage passed: 8 files, 279 tests, 100% statements/branches/
  functions/lines.
- Focused: `vitest src/calculator.test.ts`, `src/report.test.ts`, and
  `src/app.test.ts` passed after the activation anchor update.
- Focused: `playwright test ... --grep "keeps the hardware tier best-fit check
  visible"` passed 6/6 projects (desktop Chrome, desktop Safari, iPhone, Pixel,
  320px, tablet).
- Focused: `vitest src/adversarial` passed 13 oracle tests; hardware-tier
  reference focus passed 4 tests / 106 skipped.
- Visual screenshots saved in `scratchpad/visual-decimal-input/`: 390px
  default closed (18.8 GB), desktop decimal advanced open (24.5 GB), 320px
  zeroed (0.0 GB), tablet extreme guide open (139.4 GB), desktop panels open
  (90.6 GB). Script checked no horizontal overflow and preserved decimal field
  values.
- `pnpm gate` passed.

## Open work

- **Phase 2 feature backlog (F1/F2/F5/F6/F7/F8) is PARKED** — do not build
  (archived at `scratchpad/DO-NOT-DO-phase2-features.md`).
- `specs/accuracy-fix.md` T1/T2 remain: owner-gated push/redeploy, then live
  Playwright verification against 18.8 / 161.1 / Q4_K_M / QLoRA / training
  anchors.
- Recurring QA/release runs F9/F10 remain actionable in `specs/qa.md` and
  `specs/plan.md`.

## Blockers

- Owner has not authorized `git push origin main`; production remains stale.

## Known issues

- Small-screen topbar polish around GitHub/brand wrapping is pre-existing.
