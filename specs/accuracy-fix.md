> CLAIMED BY AGENT:
>
> < agent >< iteration >< run > is working on < tasks >

---

# Accuracy Fix Spec (P0 — the demo app is live with a wrong number)

The public, announced demo calculator serves a WRONG number and the engine has
one real accuracy defect. Accuracy is the whole mission (`specs/plan.md` Goal).
Fix both. Claim a task, gate-green, delete it when done; when this file is empty,
delete the file.

## Evidence (verified 2026-07-16 against EXTERNAL anchors)

- Live https://vram.rxdt.dev/ is 16 commits stale: `origin/main` (Vercel source)
  is `2401b9b`; F0 (`0b80fa1`) is not deployed. Live 7B default = **19.0 GB**;
  anchor-correct = **18.8 GB**. H1 is old; F3 quant ladder + F4/F4.1 absent.
- `main` engine IS anchor-correct: fp16 = params×2 (exact); KV = 0.125
  MiB/token = vLLM Llama-3-8B (exact); 70B Q4_K_M weights 42.44 GB ≈ real HF
  GGUF file 42.5; AdamW state in-anchor. So the 19.0 is purely a stale deploy.
- ONE real engine defect on `main`: inference activation scratch is
  **context-independent** — 70B reports 2.1 GB at 4k, 8k, AND 32k, but
  llama.cpp's compute buffer GROWS with context. At 32k+ this UNDER-estimates
  VRAM (the dangerous direction → user OOM).

## T1 — Redeploy the correct bundle (owner-gated; do NOT self-push)

- The live wrong number is fixed by deploying `main`, not by editing code.
  Prep only: confirm `main` tip builds, `pnpm gate` is green, and produce a
  one-paragraph Claude review of the deploy delta. Then STOP and hand the owner
  the exact `git push origin main` command. Per Release Rule the OWNER pushes an
  outward deploy; this spec does not authorize a self-push.
- Done when: gate green + delta review written + owner handed the command.
  (Owner performs the push + Vercel redeploy out of band.)

## T2 — Verify the LIVE site post-redeploy (report-only; blocked on T1 push)

- After the owner redeploys, drive https://vram.rxdt.dev/ with Playwright
  (absolute URLs, real browser — deep-links are JS-hydrated). Confirm against
  anchors: 7B default = 18.8; `?total-params=70` = 160.8;
  `?total-params=70&precision=Q4_K_M` resolves (F3 live) and weights ≈ 42.4;
  8B QLoRA 2% = 21.0; 7B Full training = 152.9. H1 = "VRAM Calculator for LLMs,
  Diffusion & AI Models".
- Done when: every row matches its anchor to ±0.1 GB and the result is appended
  to `docs/qa/verification-2026-07-16-live-staleness.md`. If any row misses,
  that is a T1 deploy failure (cache/branch), not a code bug.

## T3 — Fix the context-independent activation under-estimate (real engine work)

- `workload-memory.ts` `fp16ActivationScratchGb` sizes activation from
  `residentParamsB × 2 × ratio` with a fixed prefill ratio — no context term.
  Make decoder inference activation grow with context so 70B tracks the
  llama.cpp measured envelope across 4k–32k+ (≈2.2–3.3 GB at 8k, higher at
  32k), keeping the 0.5 GB floor. Anchor every number to a cited measurement;
  do NOT invent a curve. This is the F1 "architecture-keyed prefill math" seed.
- Constraints: keep short-context defaults within anchor (7B@8k stays sub-1GB,
  70B@8k in 2.2–3.3); no regressions to the pinned canonical totals unless the
  new anchor DEMANDS a change (then update the pin + cite the anchor). Add a
  test asserting activation is monotonic non-decreasing in context and lands in
  the measured band at 8k and 32k.
- Done when: 70B@32k is no longer 2.1 GB, values cite anchors, `pnpm gate`
  green, and the change passes the two high-level reviews before any deploy.

## Rules

- Never derive an expected value from our own formulas — cite external anchors
  (`specs/qa.md`, `specs/plan.md` Research Corrections). Under-estimating VRAM is
  worse than over; when unsure, say so, don't ship a confident wrong number.
- No product-code change deploys without gate + Claude + Codex review.
