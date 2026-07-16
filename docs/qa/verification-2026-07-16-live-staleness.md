# Live-Site Accuracy Verification — 2026-07-16

Report-only, per `specs/qa.md`. Triggered by the P0 accuracy mandate after the
site was deployed and publicly announced. **Verdict: the LIVE deploy is stale
and shows a wrong number; the code on `main` is anchor-correct. NO-GO on the
current live bundle. Fix is a redeploy, not a code change — owner has NOT
authorized the push.**

## 1. Deploy-drift finding (two independent confirmations)

- Vercel deploys from `origin/main`, tip **`2401b9b`** (2026-07-13).
  `git merge-base --is-ancestor 0b80fa1 origin/main` → **NO**: the F0 activation
  fix and **16** later commits on local `main` were never pushed.
- The live site (https://vram.rxdt.dev/) serves the **pre-F0** bundle: raw HTML
  ships `<h1>AI Deployment Calculator</h1>` and the seeded default total
  **`19.0 GB`**. Post-F0 (correct) is **`18.8 GB`**. It also lacks F3 (rejects
  `precision=Q4_K_M` deep links) and F4/F4.1.

The entire 19.0-vs-18.8 gap localizes to the **activation row**: pre-F0 ≈ 0.72 GB
vs the post-F0 0.5 GB floor. Weights/KV/training on the live bundle are already
anchor-correct; the stale defect is the (now-fixed) activation model.

## 2. Is `main` actually correct? Component-vs-EXTERNAL-anchor check

Not "matches our tests" — checked against published external ground truth. All
recomputed from the exact `main` formulas.

| Component | `main` output | External anchor | Verdict |
|---|---|---|---|
| 7B fp16 weights | 14.0 GB | fp16 = params×2 → 14.0 | **EXACT** |
| 70B fp16 weights | 140.0 GB | params×2 → 140.0 | **EXACT** |
| KV per-token (7B/8B bucket) | 0.1250 MiB/token | vLLM Llama-3-8B = 0.125 | **EXACT** |
| 70B Q4_K_M weights | 42.44 GB | real HF GGUF file ≈ 42.5 | **MATCH** |
| 70B Q8_0 weights | 74.38 GB | 8.5 bpw → ≈ 74.5 | **MATCH** |
| Precision ladder (4-bit→16-bit) | monotonic | bpw ordering | **HOLDS** |
| 7B full-train AdamW state | 98.0 GB (P×14) | AdamW ≈ 16 B/param | **IN-ANCHOR** |
| 70B activation @ 8k | 2.1 GB | llama.cpp 2.2–3.3 GB | **~envelope (mild under)** |

Canonical totals (post-F0, anchor-traced): 7B=18.8, 70B=160.8, 8B QLoRA 2%=21.0,
7B full-train=152.9. All reproduced from formulas + anchors, not test pins.

**Conclusion: `main` is genuinely accurate against external anchors.** Deploying
`main` is correct on the merits; the live 19.0 is the wrong value.

## 3. One real accuracy limitation (documented, bounded)

The inference activation scratch is **context-independent**: 70B reports 2.1 GB
at 4k, 8k, AND 32k. llama.cpp's measured compute buffer GROWS with context, so
at long context (32k+) the estimate is a **meaningful under-estimate** — the
dangerous direction (users could hit OOM). This is already an open Research
Correction (`specs/plan.md`: "keep 70B 4-8k context in the 1-3 GB envelope until
architecture-keyed prefill math lands" — that is F1's job). Known and bounded,
not hidden; but it caps long-context accuracy.

## 4. Verdict / actions

- **NO-GO on the live bundle** (stale; shows 19.0). The remedy is a redeploy:
  fast-forward `origin/main` to local `main` and let Vercel rebuild. This is a
  deploy action, not a code change — **owner has withheld the push**; do not
  push without authorization.
- `main` code needs no correction to fix the live number. After redeploy, re-run
  §2 against the live URL (expect 18.8 / 160.8; H1 = "VRAM Calculator …";
  Q4_K_M deep links resolve).
- **Follow-up accuracy work (not a deploy blocker):** architecture-/context-keyed
  activation math (F1) to close the long-context under-estimate in §3.

## Method

External anchors from `specs/qa.md` + `specs/plan.md` Research Corrections;
outputs recomputed from `frontend/src/calculator-core.ts` /
`workload-memory.ts` formulas. No product code, tests, or specs edited. Deploy
facts from `git merge-base` / `git rev-list origin/main..main`.
