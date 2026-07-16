# Project Status

Short, current handoff. Deleted lines are the point — keep only what's useful now.

## State (2026-07-16)

- `main` has the Phase 2 F0/F3/F4/F4.1 work, decimal input preservation,
  context-anchored decoder scratch, SEO reconciliation, and conservative
  upward memory rounding.
- Local `main` now includes conservative memory rounding: required totals,
  component GB display, minimum raw VRAM, and hardware recommendations round
  upward to one decimal instead of nearest. Boundary case: a 20.4001 GB server
  workload reports 20.5 GB, 24.2 GB minimum raw, and the 32 GB class rather
  than fitting into 24 GB.
- Static crawlable quick-reference rows were updated to calculator output after
  the rounding change: 7B 8-bit 11.5 GB, 13B fp16 32.3 GB, 70B 8-bit 88.0 GB.
- Cross-calculator QA rerun:
  `docs/qa/comparison-2026-07-16.md`. Result: no Research Correction against
  local `main`; external overlap supports resident weight math.
- Production `vram.rxdt.dev` is stale for the latest rounding bundle: it reports
  21.0 GB for 8B QLoRA 2% and 12.0 GB for SDXL, while local `main` reports
  21.1 GB and 12.1 GB. Owner-only redeploy required; agents must not deploy.
- `frontend/src/adversarial/oracle.test.ts` now has 22 green oracle tests,
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

- **P2 — F10** adversarial oracle extension (`specs/qa.md`, `specs/plan.md`).
- **Owner deploy:** after final green gate, deploy the local rounding correction
  with `vercel deploy --prod`; no agent may run it.
- **Parked (do not build):** F1/F2/F5/F6/F7/F8
  (`scratchpad/DO-NOT-DO-phase2-features.md`).

## Blockers

- apxml Part A primary is blocked in headless Playwright by Cloudflare
  Turnstile; needs an owner/manual headed pass if exact ApX rows are required.
- Production is stale for local upward rounding and under-reports two canonical
  totals by 0.1 GB; only the owner may redeploy.

## Known Issues

- Small-screen topbar polish around GitHub/brand wrapping is pre-existing.
- Parallel `pnpm gate` runs can collide on Lighthouse preview port 4173; retry
  after the other run exits if `CHROME_INTERSTITIAL_ERROR` appears.
