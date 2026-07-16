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
- `specs/frontend.md` and `specs/deploy-reconcile.md` were both deleted (no
  work remained); recurring QA remains in `specs/qa.md`/`specs/plan.md`.
- Current QA run seeded `frontend/src/adversarial/oracle.test.ts` and
  `docs/qa/adversarial-2026-07-16.md` with PB-scale URL, published bpw,
  training-order, no-KV, and URL-extreme invariants, then added Part B oracle
  cases: the vLLM 0.125 MiB/token Llama-3-8B KV anchor, a weight-quantization
  twin-invariance case, the published full-training bytes/param anchors, and a
  training-mode KV-leak guard proving LoRA/QLoRA/full training stay zero-KV and
  KV-precision invariant at 1M context. Suite is 21 green.
  Report notes a definitional limitation: GQA-only architecture buckets would
  KV-under-count legacy MHA models (e.g. Llama-2-7B) — not filed as our error.
- Hardware-tier green-check QA is covered by Playwright (`0b8c598`): default
  24 GB, 70B 192 GB, overflow, and reset states keep the correct visible marker
  across all configured browser projects/viewports.
- Deploy SEO reconciliation is on `main` (`be3386e`): the GSC verification tag
  is restored; `AI Deployment Calculator` is again the title/H1/JSON-LD name;
  VRAM/GPU memory keywords remain in title/meta; the broader prior title is
  JSON-LD `alternateName`. Local diff vs `origin/main` confirmed the other
  live-only SEO assets were the old Vercel canonical sitemap/robots.
- Production live verification passed after the owner deploy: `vram.rxdt.dev`
  serves the corrected 18.8 GB default, 70B/context/Q4_K_M/training sentinel
  values, guide panel, formula string, canonical, H1, and GSC tag.

## Checks

- `pnpm preflight` passed after T3.
- Full frontend coverage passed: 8 files, 279 tests, 100% statements/branches/
  functions/lines.
- Focused: `vitest src/calculator.test.ts`, `src/report.test.ts`, and
  `src/app.test.ts` passed after the activation anchor update.
- Focused: `playwright test ... --grep "keeps the hardware tier best-fit check
  visible"` passed 6/6 projects (desktop Chrome, desktop Safari, iPhone, Pixel,
  320px, tablet).
- Focused: `vitest src/adversarial` passed 21 oracle tests; hardware-tier
  reference focus passed 4 tests / 106 skipped.
- Focused after SEO reconciliation: `vitest src/app.test.ts` passed 111 tests;
  Playwright calculator H1/subtitle grep passed 12/12 projects; responsive H1
  grep passed 18/18 projects.
- Deploy prep checks after SEO reconciliation: `pnpm build`, `pnpm preflight`,
  and `pnpm gate` passed.
- Live deploy verification: Playwright against `https://vram.rxdt.dev/` passed
  all `specs/deploy-reconcile.md` R4 rows (`18.8`, `161.1`, `172.0`, `53.8`,
  `21.0`, `152.9` GB) plus guide/formula/H1/canonical/GSC checks.
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

- **P2 — F9/F10** recurring QA/oracle runs (`specs/qa.md`, `specs/plan.md`).
- **Parked (do not build):** F1/F2/F5/F6/F7/F8
  (`scratchpad/DO-NOT-DO-phase2-features.md`).

## Blockers

- None for the completed live deploy verification.

## Known issues

- Small-screen topbar polish around GitHub/brand wrapping is pre-existing.
- Concurrent ralph loops each run `pnpm gate`, whose Lighthouse stage binds a
  fixed preview port (4173); two overlapping runs collide and one fails with
  `CHROME_INTERSTITIAL_ERROR`. It is transient (retry once the other run's
  Lighthouse frees the port), not a code regression. A parallel agent already
  capped Playwright `workers: 2` in `harness/playwright.config.js` (`9782b97`).
