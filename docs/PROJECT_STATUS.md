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
- Shipped: direct `decoder-scratch.test.ts` (`0ead7c7`) pins that activation
  formula to its llama.cpp anchors (70B 8k≈2.32 GB #7804, 32k≈4.43 GB #10003,
  0.5 GB floor, linear scaling, monotonic context growth, out-of-range clamps),
  closing the former P1 accuracy-guard gap; was covered only indirectly before.
- `specs/frontend.md` had no remaining frontend build work after that fix, so
  it was deleted. Deploy prep now lives in `specs/deploy-reconcile.md`;
  recurring QA remains in `specs/qa.md`/`specs/plan.md`.
- Current QA run seeded `frontend/src/adversarial/oracle.test.ts` and
  `docs/qa/adversarial-2026-07-16.md` with PB-scale URL, published bpw,
  training-order, no-KV, and URL-extreme invariants.
- Hardware-tier green-check QA is covered by Playwright (`0b8c598`): default
  24 GB, 70B 192 GB, overflow, and reset states keep the correct visible marker
  across all configured browser projects/viewports.
- Deploy SEO reconciliation is on `main` (`be3386e`): the GSC verification tag
  is restored; `AI Deployment Calculator` is again the title/H1/JSON-LD name;
  VRAM/GPU memory keywords remain in title/meta; the broader prior title is
  JSON-LD `alternateName`. Local diff vs `origin/main` confirmed the other
  live-only SEO assets were the old Vercel canonical sitemap/robots.
- Production is BEHIND `main` (not yet deployed). Deploy prep now has local
  build/preflight/gate green and a Codex deploy-delta review; it still needs the
  required Claude review and owner push.

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
- Focused after SEO reconciliation: `vitest src/app.test.ts` passed 111 tests;
  Playwright calculator H1/subtitle grep passed 12/12 projects; responsive H1
  grep passed 18/18 projects.
- Deploy prep checks after SEO reconciliation: `pnpm build`, `pnpm preflight`,
  and `pnpm gate` passed.
- Codex deploy-delta review: GO after required Claude review and owner deploy;
  the delta is accuracy-positive (7B 18.8, 70B 161.1, Q4_K_M 42.44 GB weights)
  and SEO-safe (GSC restored, `AI Deployment Calculator` restored, VRAM/GPU
  keywords retained).
- Guide-panel regression sweep: current `index.html` still has all five result
  panels plus the guide formula/prose/reference table; focused Vitest summary
  test and Playwright details-panel test passed.
- Visual screenshots saved in `scratchpad/visual-decimal-input/`: 390px
  default closed (18.8 GB), desktop decimal advanced open (24.5 GB), 320px
  zeroed (0.0 GB), tablet extreme guide open (139.4 GB), desktop panels open
  (90.6 GB). Script checked no horizontal overflow and preserved decimal field
  values.
- Prior `pnpm gate` passed after the activation work.

## Open work (priority-ranked; see `specs/plan.md` PRIORITIES)

- **P0 — Confirm the deploy landed (owner is gating + pushing `main` now).**
  `main` is verified strictly better, no regressions (see plan.md P0). The four
  "regressions" seen on the live site (7B=19.0, missing guide panel, `0.7/19.0`
  formula, rejected Q4_K_M) were ALL the stale bundle — deploying fixes all of
  them. Active gap-closer: `deploy-reconcile.md` R4 — after the push, drive the
  LIVE site and confirm the corrected values (do NOT assume the deploy landed;
  caches can serve stale). **Only the owner deploys.**
- **P2 — F9/F10** recurring QA/oracle runs (`specs/qa.md`, `specs/plan.md`).
- **Parked (do not build):** F1/F2/F5/F6/F7/F8
  (`scratchpad/DO-NOT-DO-phase2-features.md`).

## Blockers

- Owner is gating + pushing `main` now, but `git ls-remote origin
  refs/heads/main` still reports GSC-only `2401b9b`; production remains stale
  until that ref changes. Prefer a lease-protected push over a plain push.

## Known issues

- Small-screen topbar polish around GitHub/brand wrapping is pre-existing.
