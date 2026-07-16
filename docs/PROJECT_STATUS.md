# Project Status

Short, current handoff. Deleted lines are the point — keep only what's useful now.

## State (2026-07-16)

- Shipped on local `main`: F0 activation floor, F3 quant ladder, F4 crawlable
  prose, F4.1 guide relocation/FAQ removal, decimal input preservation,
  context-anchored decoder scratch (llama.cpp anchors, direct anchor test in
  `decoder-scratch.test.ts`), SEO reconciliation, F9 cross-calculator QA, and
  conservative upward memory rounding (totals, component display, minimum raw
  VRAM, and hardware tiers round up at one decimal; a 20.4001 GB workload
  reports 20.5 GB and the 32 GB class, never a 24 GB fit).
- Static crawlable quick-reference rows match calculator output after the
  rounding change: 7B 8-bit 11.5 GB, 13B fp16 32.3 GB, 70B 8-bit 88.0 GB.
- Cross-calculator QA rerun: `docs/qa/comparison-2026-07-16.md`. No Research
  Correction against local `main`; external overlap supports resident weight
  math; all disagreements definitional.
- Engine accuracy audit (2026-07-16, orchestrator): every core component —
  fp16/Q4_K_M/int8 weights, GQA KV cache at 8k/32k, decoder activation scratch
  — recomputed from the real engine and matched its published anchor to 0.0%.
  Only int8's +5% overhead is a convention rather than a measured anchor.
  Vision/diffusion/video/audio/tabular branches have no verified external
  anchor yet; F10 exists to close that.
- **Production is stale because `main` is unpushed.** `origin/main` = `e1e5af9`
  (pushed 2026-07-15 19:16); local `main` is ~38 commits ahead. The owner
  deployed 2026-07-15 and again 2026-07-16, but both deploys predate or exclude
  the upward-rounding work, so live `vram.rxdt.dev` serves pre-rounding
  numbers — verified 2026-07-16 by curl: live static rows 11.4/32.2/87.9 GB vs
  local 11.5/32.3/88.0 GB; live under-reports and 87.9 sits on the wrong side
  of a tier boundary.
- `frontend/src/adversarial/oracle.test.ts` has 22 green oracle tests,
  including the hardware-boundary round-up invariant. The dated report is
  `docs/qa/adversarial-2026-07-16.md`.
- Vercel deploy path: a gated CI deploy job exists in
  `.github/workflows/ci.yml` (`needs: checks`, push-to-main only, off unless
  `VERCEL_DEPLOY_ENABLED=true` + `VERCEL_*` secrets are set).

## Current Local Sentinels

- Default 7B fp16 inference: 18.8 GB total, 22.2 GB minimum raw.
- 8B server inference: 21.0 GB total, 24.8 GB minimum raw.
- 8B QLoRA at 2% adapters: 21.1 GB.
- SDXL 1024x1024 image diffusion preset: 12.1 GB.
- 47B MoE high-context server case: 95.1 GB raw, 96 GB class (not the 95 GB
  TPU class).

## Checks (agent run of 2026-07-16, pre-rounding-release gate)

- Focused vitest (calculator/property/report/hardware/result-format/app):
  260 tests passed.
- Focused `vitest src/adversarial`: 22 oracle tests passed (re-verified by
  orchestrator 2026-07-16).
- Focused Playwright desktop calculator/parity: 46 passed, 4 expected skips.
- `pnpm build`, `pnpm preflight`, and `pnpm gate` all passed for the F9
  report/release run.

## Open Work

- Agent priorities live in `specs/plan.md` PRIORITIES (P1 tagline centering,
  P2 topnav overflow at 320/390px, P2 F10 oracle extension).
- **Owner: push and deploy.** `git push` publishes the ~38 local commits
  (including the rounding fix); then deploy via the CI job (if armed) or
  `vercel deploy --prod` from this checkout. Until pushed, ANY deploy sourced
  from GitHub ships the stale `e1e5af9` code. No agent may push or deploy.
- **Owner device pass:** real-device check (iPhone Safari, Android Chrome):
  no horizontal scroll at 320/390px, no <=30em label overlap. Optional
  post-launch owner calls: analytics, error monitoring.
- **Parked (do not build):** F1/F2/F5/F6/F7/F8
  (`scratchpad/DO-NOT-DO-phase2-features.md`).

## Blockers

- apxml Part A primary is blocked in headless Playwright by Cloudflare
  Turnstile; needs an owner/manual headed pass if exact ApX rows are required.
- Production serves pre-rounding numbers until the owner pushes and redeploys
  (see State).

## Known Issues

- Parallel `pnpm gate` runs can collide on Lighthouse preview port 4173; retry
  after the other run exits if `CHROME_INTERSTITIAL_ERROR` appears.
