codex-accuracy-1/1 is working on T3 context-dependent activation scratch in this spec

> CLAIMED BY AGENT:
>
> < agent >< iteration >< run > is working on < tasks >

---

# Accuracy Fix Spec (P0 — the demo app is live with a wrong number)

The public, announced demo calculator serves a WRONG number. Accuracy is the
whole mission (`specs/plan.md` Goal). Fix it. Claim a task, gate-green, delete
it when done; when this file is empty, delete the file.

## Evidence (verified 2026-07-16 against EXTERNAL anchors)

- Live https://vram.rxdt.dev/ is 16 commits stale: `origin/main` (Vercel source)
  is `2401b9b`; F0 (`0b80fa1`) is not deployed. Live 7B default = **19.0 GB**;
  anchor-correct = **18.8 GB**. H1 is old; F3 quant ladder + F4/F4.1 absent.
- `main` engine is anchor-correct: fp16 = params×2 (exact); KV = 0.125
  MiB/token = vLLM Llama-3-8B (exact); 70B Q4_K_M weights 42.44 GB ≈ real HF
  GGUF file 42.5; AdamW state in-anchor; decoder scratch now follows llama.cpp
  70B 8k/32k compute-buffer anchors. So the live 19.0 is a stale deploy.

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
  anchors: 7B default = 18.8; `?total-params=70` = 161.1;
  `?total-params=70&precision=Q4_K_M` resolves (F3 live) and weights ≈ 42.4;
  8B QLoRA 2% = 21.0; 7B Full training = 152.9. H1 = "VRAM Calculator for LLMs,
  Diffusion & AI Models".
- Done when: every row matches its anchor to ±0.1 GB and the result is appended
  to `docs/qa/verification-2026-07-16-live-staleness.md`. If any row misses,
  that is a T1 deploy failure (cache/branch), not a code bug.

## Rules

- Never derive an expected value from our own formulas — cite external anchors
  (`specs/qa.md`, `specs/plan.md` Research Corrections). Under-estimating VRAM is
  worse than over; when unsure, say so, don't ship a confident wrong number.
- No product-code change deploys without gate + Claude + Codex review.
