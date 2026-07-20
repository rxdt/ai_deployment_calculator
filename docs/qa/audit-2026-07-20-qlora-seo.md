# Audit — QLoRA calibration, domain migration, and search visibility (2026-07-20)

Findings from an external review of the deployed build (`vram.rxdt.dev`, `origin/main`).
This document is the record; **no calculation logic was changed in this PR** because a
local QLoRA fix was reported to be in flight — the recommended code changes below are
left for the owner to apply and reconcile.

Method: drove the real deployed pipeline (`normalizedState → specFromState →
memoryBreakdown`) across QLoRA/LoRA/full/inference at several model sizes and context
lengths.

---

## 1. QLoRA "bug" — calibration, not broken math (repo change recommended)

The QLoRA path is **structurally correct**: it freezes a 4-bit NF4 base, sizes
optimizer + gradient state for the adapter only, and comes out properly cheaper than
LoRA-16bit and full fine-tune. No formula error was found.

The estimates read **too high versus published QLoRA figures**, and the driver is the
**8000-token default context**. Training activation scales linearly with context, so the
default inflates every fine-tuning estimate.

Deployed numbers (7B, batch 1, gradient checkpointing on, AdamW, adapter 0.5%):

| Scenario | Total | Notes |
| --- | --- | --- |
| 7B QLoRA, **ctx 8000 (default)** | **18.5 GB** | won't fit a 12 GB card |
| 7B QLoRA, ctx 2048 | 12.6 GB | matches ~12–16 GB references |
| 7B QLoRA, ctx 512 | 11.1 GB | fits a 12 GB card |
| 7B LoRA 16-bit, ctx 8000 | 30.9 GB | 4-bit base saves ~12 GB vs this |
| 7B full training 16-bit | 152.9 GB | ~16 bytes/param Adam, correct |
| 7B inference 16-bit | 18.8 GB | seed default |
| 70B QLoRA, ctx 8000 | 99.9 GB | vs paper "65B on 48 GB" (short ctx) |
| 70B QLoRA, ctx 512 | 63.1 GB | closer; still conservative |

Breakdown (7B QLoRA default): weights 4.02 · activation 6.29 · trainState 0.42 ·
overhead 4.00 · buffer 3.68 → 18.5 GB. The activation term is the swing factor.

### Recommended change
- **Default context → 2048** in `defaultState()` (`frontend/src/state.ts`). This alone
  brings 7B QLoRA to 12.6 GB, in line with published figures.
  - Test impact is non-trivial: the seed inference default (`18.8 GB`, `22.2 GB`, tier
    strings, etc.) is asserted across many unit/e2e tests and will need updating.
    Treat as a deliberate recalibration, not a one-liner.
- Optional: default the QLoRA optimizer to **paged 8-bit AdamW** (real QLoRA practice;
  2 bytes/param adapter state instead of 8). Small effect, better realism.

### Two correct-but-counterintuitive behaviors (consider a tooltip, not a fix)
- 7B QLoRA (18.5) ≈ 7B fp16 inference (18.8): correct — the 4-bit base offsets training
  overhead — but users will double-take.
- Estimates carry a 1.25 safety buffer + 4 GB overhead, so they run conservative versus
  paper figures. Appropriate for a "what to buy" tool; worth stating explicitly.

---

## 2. Domain migration + Search Console (NOT a repo change — do in GSC)

The move to `vram.rxdt.dev` is clean in-repo: canonical, `og:url`, sitemap, and robots
all point to the new host, and the old Vercel URL 308-redirects. **But Search Console is
per-exact-URL**, so the verified `aideploymentcalculator.vercel.app` property does **not**
cover the new domain. Until this is done, the live domain is effectively unregistered
with Google:

1. Add **`https://vram.rxdt.dev/`** as a new **URL-prefix** property in Search Console.
2. Verify it — needs its own token. The current `google-site-verification` meta in
   `frontend/index.html` was issued for the Vercel property; the new property will emit a
   new token. (Owner can hand that token over to add the meta tag, or use the HTML-tag
   method.)
3. **Sitemaps** → submit `sitemap.xml`. **URL Inspection** → Request Indexing.

---

## 3. Search ranking / competitors (mostly not a repo change — strategy)

Calculators ranking now (TechCompare, Skorppio, simulations4all) are largely
**inference-only** (weights + KV + overhead). This tool's edge is real depth:
fine-tuning (LoRA/QLoRA/full), diffusion/vision/audio/multimodal, hardware tiers, and a
real bits-per-weight quant ladder.

Recommendation: don't fight for the head term "vram calculator" (dominated by apxml / HF).
Own the **thinner fine-tuning long-tail** where the depth is the answer:

- "qlora vram calculator"
- "lora fine-tuning gpu memory calculator"
- "fine-tuning vram requirements calculator"
- "how much vram to fine-tune llama 70b"

Put these exact phrases in the `<title>`/`<h1>` of dedicated sub-pages or the
`/calculator-writeup` page (in-repo content changes, if desired), and pursue external
backlinks/mentions. These queries are where the simple calculators can't compete.

References: spheron.network fine-tune VRAM guide; modal.com VRAM blog; techcompare;
skorppio.

---

## Summary of action items

| Item | Where | Owner action |
| --- | --- | --- |
| Default context 2048 (QLoRA calibration) | repo (`state.ts` + tests) | reconcile with local fix, then apply |
| Optional: QLoRA optimizer default paged-8bit | repo | optional |
| Tooltip: QLoRA≈inference + conservative buffer | repo (content) | optional |
| Register `vram.rxdt.dev` in Search Console | GSC (not repo) | required |
| Submit sitemap + request indexing (new domain) | GSC (not repo) | required |
| Long-tail fine-tuning SEO sub-pages/keywords | repo (content) + backlinks | recommended |
