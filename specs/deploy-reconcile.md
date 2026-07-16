> CLAIMED BY AGENT:
>
> < agent >< iteration >< run > is working on < tasks >

---

# Deploy Reconcile Spec (P0 — SEO-safe deploy of the accurate build)

`main` and the live deploy source (`origin/main` = `2401b9b`) have DIVERGED
(merge-base `0343db4`). `main` (`1e71d16`) is more ACCURATE but drops live-only
SEO. Reconcile on `main` so a deploy is strictly an improvement, then hand the
OWNER the deploy — **no agent ever pushes/deploys** (see PROMPT.md). Claim a
task, gate-green, delete it when done; delete this file when empty.

## Verified facts (2026-07-16)

- BETTER on main: F0 activation fix (live serves pre-F0: 7B=19.0, correct 18.8);
  F3 quant ladder (live rejects Q4_K_M; main 70B Q4_K_M=42.44≈real GGUF 42.5);
  decimal fix; F4/F4.1 guide. **Canonical is correct on main** (`vram.rxdt.dev`);
  live canonical = `aideploymentcalculator.vercel.app`, which 308-redirects to
  vram.rxdt.dev (confirmed) → an SEO defect main already fixes.
- SEO reconciled on main: the Google Search Console verification tag is restored,
  sitemap/robots are canonical to `vram.rxdt.dev`, and the announced
  "AI Deployment Calculator" brand is the title/H1/JSON-LD name. The broader
  "VRAM Calculator for LLMs, Diffusion & AI Models" phrase remains in JSON-LD
  `alternateName`.
- Domain (settled): vram.rxdt.dev is canonical; Vercel 308s the .app to it.

## R3 — Prep the deploy (owner-gated; NEVER self-push)

- Remaining blocker: run the required Claude review of the deploy delta vs live
  (local CLI currently says `Not logged in`). If it passes, hand the OWNER the
  deploy-delta summary and exact lease-protected push command. STOP. **Only the
  owner deploys.**

## R4 — Post-deploy live verification (after the owner deploys)

- Playwright, absolute URLs on https://vram.rxdt.dev/ (deep-links are
  JS-hydrated): 7B default=18.8; `?total-params=70`=161.1;
  `?total-params=70&precision=Q4_K_M` resolves ≈42.4; 8B QLoRA 2%=21.0;
  7B full-train=152.9. Confirm `AI Deployment Calculator`, canonical=
  vram.rxdt.dev, and the GSC tag are live. Append results to
  `docs/qa/verification-2026-07-16-live-staleness.md`.

## Rule

Cite external anchors, not our own formulas, for any number (`specs/qa.md`,
`specs/plan.md` Research Corrections). No product-code or SEO change deploys
without gate + Claude + Codex review, and the deploy itself is OWNER-ONLY.
