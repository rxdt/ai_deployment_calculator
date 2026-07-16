codex-deploy-reconcile-2-2 is working on R1 GSC restoration and R2 brand/title reconciliation in this spec

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
- WORSE on main (must fix): the **Google Search Console verification meta tag**
  exists only on live.
- UNDECIDED (SEO-critical): brand/title. Live ranks as "AI Deployment
  Calculator" (announced, query-targeted); main renamed to "VRAM Calculator for
  LLMs, Diffusion & AI Models". Owner wants whichever gets more views.
- Domain (settled): vram.rxdt.dev is canonical; Vercel 308s the .app to it.

## R1 — Restore the GSC verification tag on `main`

- Add to `frontend/index.html` `<head>` (value from live `2401b9b`):
  `<meta name="google-site-verification" content="GUhbPyFhhq-ntorAXKLG9Ty_M_FZwZXcuBoU7SWPhYI" />`
- Diff `git diff main origin/main` for any OTHER live-only SEO asset
  (sitemap/robots/JSON-LD). main already has sitemap+robots at vram.rxdt.dev, so
  GSC is expected to be the only gap — confirm and note.
- Done: tag on main, `pnpm gate` green.

## R2 — Brand/title decision by SEO research ("whichever gets more views")

- Research which brand ranks better for this tool: "AI Deployment Calculator"
  (announced, currently ranking) vs "VRAM Calculator for LLMs, Diffusion & AI
  Models" (main). Weigh: search volume for "vram calculator" vs "ai deployment
  calculator", the brand already announced in the wild, and the cost of churning
  a freshly-announced/ranking title. Keep the loser as JSON-LD `alternateName`.
- Apply the winner consistently across `frontend/index.html` + `frontend/404.html`
  (title, H1, meta description, og/twitter, JSON-LD `name`), and update the SEO
  e2e assertions (`app.test.ts` static-SEO test; `calculator.spec.ts`
  subtitle/H1).
- DEFAULT if research is inconclusive: keep the announced, already-ranking
  "AI Deployment Calculator" — do not reset SEO on a live announced site without
  evidence.
- Done: one consistent brand across all SEO surfaces; gate green; assertions match.

## R3 — Prep the deploy (owner-gated; NEVER self-push)

- After R1+R2: confirm `main` builds, `pnpm gate` green, run the two high-level
  reviews (Claude + Codex) of the deploy delta vs live. Write a one-paragraph
  deploy-delta summary (accuracy gains + SEO reconciled + GSC restored) and hand
  the OWNER the exact command. STOP. **Only the owner deploys.**

## R4 — Post-deploy live verification (after the owner deploys)

- Playwright, absolute URLs on https://vram.rxdt.dev/ (deep-links are
  JS-hydrated): 7B default=18.8; `?total-params=70`=160.8;
  `?total-params=70&precision=Q4_K_M` resolves ≈42.4; 8B QLoRA 2%=21.0;
  7B full-train=152.9. Confirm chosen brand/title, canonical=vram.rxdt.dev, and
  the GSC tag are live. Append results to
  `docs/qa/verification-2026-07-16-live-staleness.md`.

## Rule

Cite external anchors, not our own formulas, for any number (`specs/qa.md`,
`specs/plan.md` Research Corrections). No product-code or SEO change deploys
without gate + Claude + Codex review, and the deploy itself is OWNER-ONLY.
