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

## Open work (priority-ranked; see `specs/plan.md` PRIORITIES)

- **P0 — Get a correct, non-regressing build DEPLOYABLE.** Prod is stale and
  serves 19.0 (correct 18.8). `main` is verified more accurate. Deploy is gated
  on the SEO reconciliation in `specs/deploy-reconcile.md` (GSC tag restored ✅;
  brand/title decision R2 pending) — NOT a bare `git push`. **Only the owner
  deploys.** NOTE: `accuracy-fix.md` (T1 "redeploy") and `deploy-reconcile.md`
  (R1–R4) OVERLAP on the deploy — `deploy-reconcile.md` is the fuller,
  authoritative path (it includes the brand/title blocker). Do not run two
  parallel deploy-preps; consolidate on `deploy-reconcile.md` and let
  `accuracy-fix.md` shrink to nothing.
- **P1 — Guard the just-fixed accuracy:** add a direct `decoder-scratch.ts`
  unit test pinning its llama.cpp anchors (≈2.2 GB @8k, ≈4.2 GB @32k for 70B;
  0.5 GB floor) + context-growth invariant. Currently only covered indirectly.
- **P1 — Brand/title SEO decision** (`deploy-reconcile.md` R2) — blocks the P0.
- **P2 — F9/F10** recurring QA/oracle runs (`specs/qa.md`, `specs/plan.md`).
- **Parked (do not build):** F1/F2/F5/F6/F7/F8
  (`scratchpad/DO-NOT-DO-phase2-features.md`).

## Blockers

- Owner has not authorized deploy; production remains stale (P0).
- Deploy blocked on the brand/title decision (`deploy-reconcile.md` R2).

## Known issues

- Small-screen topbar polish around GitHub/brand wrapping is pre-existing.
