codex-1-1 is working on R4 post-deploy live verification in this spec

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

## R3 — Deploy (OWNER is running the gate + pushing; NEVER self-push)

- The owner is gating and deploying `main` directly. Agents do NOT push. This
  task is done from the loop's side; the active gap-closer is R4.

## R4 — Post-deploy live verification (ACTIVE once prod is pushed)

Do NOT assume the push landed — a deploy can cache-miss or serve a stale bundle.
Drive https://vram.rxdt.dev/ with Playwright (absolute URLs, real browser;
deep-link `[data-out]` values are JS-hydrated, so a plain curl only sees the
seeded default). Verify against these independently-recomputed expected values
(from `main`'s shipping code, cross-checked to external anchors):

| URL (on vram.rxdt.dev) | data-out="total" | key check |
| --- | --- | --- |
| `/` (7B fp16 8k default) | **18.8 GB** | was 19.0 when stale; activation row 0.5 not 0.7 |
| `/?total-params=70` | **161.1 GB** | act 2.3 (llama.cpp), was 166.2 stale |
| `/?total-params=70&context-tokens=32000` | **172.0 GB** | act grows to 4.4 (context-anchored) |
| `/?total-params=70&precision=Q4_K_M` | **53.8 GB** | F3 live (weights 42.4 ≈ real GGUF); NOT rejected/fallback |
| `/?total-params=8&execution-mode=QLoRA fine-tuning&lora-trainable-percent=2` | **21.0 GB** | QLoRA < full-train |
| `/?total-params=7&execution-mode=Full training` | **152.9 GB** | AdamW state 98 |

Also confirm on the live page: the "How VRAM is calculated" guide panel is
present (missing while stale); the "Formula used" default reads
`18.8 GB ≈ (14.0 + 1.0 + 0.5 + 1.5) GB × 1.10` (NOT the `0.7 / 19.0` stale
string); H1 = "AI Deployment Calculator"; canonical = `https://vram.rxdt.dev/`;
GSC tag present. Any mismatch = the deploy did not fully land (cache/branch),
NOT a code bug — report it, do not "fix" the math. Append the result table to
`docs/qa/verification-2026-07-16-live-staleness.md`; when all rows pass, this
spec is empty — delete it.

## Rule

Cite external anchors, not our own formulas, for any number (`specs/qa.md`,
`specs/plan.md` Research Corrections). No product-code or SEO change deploys
without gate + Claude + Codex review, and the deploy itself is OWNER-ONLY.
