# Project Status

Short, current handoff. Deleted lines are the point — keep only what's useful now.

## State (2026-07-16)

- Shipped on `main`: F0 activation floor, F3 quant ladder, F4 crawlable prose,
  F4.1 guide relocation/FAQ removal, decimal input preservation,
  context-anchored decoder scratch (llama.cpp anchors, direct anchor test in
  `decoder-scratch.test.ts`), SEO reconciliation, F9 cross-calculator QA, and
  conservative upward memory rounding (totals, component display, minimum raw
  VRAM, and hardware tiers round up at one decimal; a 20.4001 GB workload
  reports 20.5 GB and the 32 GB class, never a 24 GB fit). `specs/frontend.md`
  and `specs/deploy-reconcile.md` were deleted — no work remained.
- Static crawlable quick-reference rows match calculator output after the
  rounding change: 7B 8-bit 11.5 GB, 13B fp16 32.3 GB, 70B 8-bit 88.0 GB.
- Cross-calculator QA rerun: `docs/qa/comparison-2026-07-16.md`. No Research
  Correction against local `main`; external overlap supports resident weight
  math; all disagreements definitional.
- Engine accuracy audit (2026-07-16, orchestrator): every core component —
  fp16/Q4_K_M/int8 weights, GQA KV cache at 8k/32k, decoder activation scratch
  — recomputed from the real engine and matched its published anchor to 0.0%.
  Only int8's +5% overhead is a convention rather than a measured anchor.
- Production `vram.rxdt.dev` is stale for the latest rounding bundle: it reports
  21.0 GB for 8B QLoRA 2% and 12.0 GB for SDXL, while local `main` reports
  21.1 GB and 12.1 GB. Owner-only redeploy required; agents must not deploy.
- `frontend/src/adversarial/oracle.test.ts` has 22 green oracle tests,
  including the hardware-boundary round-up invariant. The dated report is
  `docs/qa/adversarial-2026-07-16.md`.

## Current Local Sentinels

- Default 7B fp16 inference: 18.8 GB total, 22.2 GB minimum raw.
- 8B server inference: 21.0 GB total, 24.8 GB minimum raw.
- 8B QLoRA at 2% adapters: 21.1 GB.
- SDXL 1024x1024 image diffusion preset: 12.1 GB.
- 47B MoE high-context server case now needs 95.1 GB raw and moves from the
  95 GB TPU class to the 96 GB class.

## Checks

- Focused: `vitest src/calculator.test.ts src/calculator.property.test.ts
  src/report.test.ts src/hardware.test.ts src/result-format.test.ts
  src/app.test.ts` passed 260 tests.
- Focused: `vitest src/adversarial` passed 22 oracle tests.
- Focused Playwright desktop calculator/parity passed 46 tests with 4 expected
  skips after rounding expectation updates.
- F9 QA rerun: Playwright read production and local preview, then compared
  asmirnov and the HF GGUF Space. ApX remained blocked by Cloudflare Turnstile.
- `pnpm build` passed for local preview verification.
- `pnpm preflight` passed for the F9 report commit.
- `pnpm gate` passed for the F9 report/release run.

## Open Work

- Agent priorities live in `specs/plan.md` PRIORITIES (tagline centering,
  topnav overflow, F10 oracle extension).
- **Owner deploy:** ship the local rounding correction. Either
  `vercel deploy --prod`, or activate the gated CI deploy job
  (`.github/workflows/ci.yml`): set `VERCEL_TOKEN`/`VERCEL_ORG_ID`/
  `VERCEL_PROJECT_ID` secrets + `VERCEL_DEPLOY_ENABLED=true` repo variable,
  then `git push`. No agent may deploy or push.
- **Owner device pass:** real-device check (iPhone Safari, Android Chrome):
  no horizontal scroll at 320/390px, no <=30em label overlap. Optional
  post-launch owner calls: analytics, error monitoring.
- **Parked (do not build):** F1/F2/F5/F6/F7/F8
  (`scratchpad/DO-NOT-DO-phase2-features.md`).
- `docs/LAUNCH_TODO.md` deleted 2026-07-16: launch happened; done items
  removed, live defects moved to plan PRIORITIES, owner items moved here.

## Blockers

- apxml Part A primary is blocked in headless Playwright by Cloudflare
  Turnstile; needs an owner/manual headed pass if exact ApX rows are required.
- Production is stale for local upward rounding and under-reports two canonical
  totals by 0.1 GB; only the owner may redeploy.

## Known Issues

- Small-screen topbar polish around GitHub/brand wrapping is pre-existing.
- Parallel `pnpm gate` runs can collide on Lighthouse preview port 4173; retry
  after the other run exits if `CHROME_INTERSTITIAL_ERROR` appears.
