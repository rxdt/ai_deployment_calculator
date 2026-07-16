# Project Status

Short, current handoff. Deleted lines are the point — keep only what's useful now.

## State (2026-07-16)

- `main` includes the Phase 2 F0/F3/F4/F4.1 work plus the decimal-input fix
  (`d5cbaf0`): URL normalization and decimal text inputs now preserve up to 2
  decimal places, including `gpuResidentFraction=0.75` and
  `loraTrainablePercent=0.05`.
- `specs/frontend.md` had no remaining frontend build work after that fix, so
  it was deleted. Active work is now the recurring QA/release loop in
  `specs/qa.md` and `specs/plan.md`.
- Current QA run seeded `frontend/src/adversarial/oracle.test.ts` and
  `docs/qa/adversarial-2026-07-16.md` with PB-scale URL, published bpw,
  training-order, no-KV, and URL-extreme invariants.
- Production is BEHIND `main` (not yet deployed). Deploy still needs automated
  gate green, one high-level Claude review, and one high-level Codex review;
  owner pushes.

## Checks

- `pnpm preflight` passed.
- Focused: `vitest src/state.test.ts src/input-sanitizer.test.ts` passed 22
  tests; earlier focused `src/state.test.ts src/app.test.ts` passed 131 tests
  before the app-test addition was moved to the focused sanitizer test.
- Focused: `vitest src/app.test.ts` passed 110 tests after aligning the
  sanitizer expectation with the 2-decimal behavior.
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
- Recurring QA/release runs F9/F10 remain actionable in `specs/qa.md` and
  `specs/plan.md`.
- Frontend regression sweep requested in `specs/qa.md`; current run only
  spot-checked the hardware-tier checkmark via DOM test and existing screenshot.

## Blockers

- None open.

## Known issues

- Small-screen topbar polish around GitHub/brand wrapping is pre-existing.
