# AI Deployment VRAM Calculator Plan

> ~~strikethrough~~ strikethrough completed items to clarify what is done

## Goal

Build a GPU VRAM calculator that is easy enough for non-technical users and
trustworthy enough for engineers.

The app must:

1. Support more than GPUs for LLMs — the calculator covers text, embeddings,
   encoder-decoder, vision, multimodal, image diffusion, video, audio, and
   tabular workloads, and all product copy must say so. **Never brand or
   describe this as an LLM-only tool.**
2. Use frontend TypeScript as the calculation source of truth.
3. Keep calculator formulas in one frontend TypeScript source of truth.
4. Keep the main UI short.
5. Put rare details in `Advanced assumptions`.
6. Show enough math in collapsed details that engineers can trust the
   recommendation.

Do not pretend one equation covers all AI workloads.

## Naming Contract

Use these names in the UI, docs, labels, and tests:

```ts
type WorkloadFamily =
  | "text_generation"
  | "text_encoder"
  | "encoder_decoder"
  | "vision"
  | "vision_language"
  | "image_diffusion"
  | "video_generation"
  | "audio"
  | "tabular"
  | "custom";
```

## Commands

Use `pnpm preflight` for the loop preflight and `pnpm gate` for the full gate.
Frontend-specific build, coverage, Playwright, Lighthouse, and preview commands
live in `specs/frontend.md`, along with the gate landmines loops keep hitting.

## Research Corrections

These are non-negotiable:

- Required_GB = (Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB) \* Buffer is the canonical equation.
- KV cache is only for autoregressive/generative transformer workloads.
- KV cache must use architecture, sequence length, concurrency, and KV precision.
- Never use KV = Active_P / 10.
- Training VRAM is not a single P \* 16 result.
- LoRA trains adapters, not all base weights.
- QLoRA uses a frozen 4-bit base plus adapter state, not a flat 4 GB overhead.
- Diffusion/video memory is pipeline-specific and lower certainty by default.
- Known Model File Size should override parameter-based weight estimates for GGUF/exact files.
- MoE active parameters affect rough speed, not resident weight memory, unless expert offload/sharding is enabled.
- (2026-07-12 audit) Our KV math assumes GQA (8 KV heads). That matches
  Llama-3-era models exactly (vLLM: 0.125 MiB/token for Llama-3-8B) but
  underestimates MHA-era models (Llama 2) ~4x. Fix by using real
  `num_key_value_heads` when known (see F1) and footnote the assumption
  otherwise.
- (2026-07-12 audit) Generic "4-bit" (4.0 bpw) understates the most popular
  real quant: GGUF Q4_K_M is 4.85 bpw. Use real bits-per-weight per quant
  (see F3). Do NOT copy competitor shortcuts: flat 1.2x weight overhead on
  fp16, MHA-only KV, flat 2.5x/1.5x/1.2x training multipliers, or GiB
  mislabeled as GB — we verified all of these wrong against published
  reference points.

## Phase 1 — Core calculator: COMPLETE (2026-07-12)

All 26 original acceptance criteria are done, gate-verified, and deployed to
https://vram.rxdt.dev/ (Lighthouse 100/100/100/100 on the
production build). ~~Criteria list collapsed; see git history for the
original items.~~ Since then also shipped: URL deep-link state + malformed-URL
clamping, preset chips with derived active-state (chip highlight + header
model link), best-fit-only hardware tier column, usable-VRAM fit meter copy,
95% tight threshold, Local/Edge beyond-local-hardware warning, WebKit
fit-scale fix, gradient-checkpointing uncheck fix ("off" serialization),
OG image + JSON-LD + sitemap + canonical, 404 page as a real build input,
Vercel deploy.

## Phase 2 — Competitive features (from the 2026-07-12 six-competitor teardown)

Priority order. Each feature's frontend contract is specified in
`specs/frontend.md`. Do not duplicate what we already have: concurrent
batching (our Concurrent Batch Requests ≡ apxml's concurrent users), known
file-size override, usable-VRAM-aware recommendations, training depth
(LoRA/QLoRA/full), and workload breadth are already ours and ahead of every
competitor.

- [ ] **F1. Hugging Face model lookup** (effort M). Client-side, no backend:
      HF quicksearch API for typeahead, then `config.json` (+ safetensors
      index when present) for exact params, layers, hidden size, and
      `num_key_value_heads`. Fills the form; manual entry stays as the
      fallback (gated models 401 on config fetch — degrade gracefully).
      Fixes the GQA correction above with real KV-head counts.
- [ ] **F2. Layer-offload output** (effort S once F1 lands). When the model
      does not fit the selected/recommended GPU, output "N of L layers fit on
      GPU, rest to CPU" with the per-layer GB figure. Layers come from F1 or
      the existing architecture table. This converts a dead-end "does not
      fit" into an actionable answer for the Ollama/llama.cpp audience.
- [ ] **F3. Real quant ladder** (effort S). Replace generic bit-widths with
      real bits-per-weight: GGUF IQ1_S 1.56 … Q4_K_M 4.85 … Q8_0 8.5, plus
      INT2 (0.25 B/param) and INT3 (0.375 B/param) tiers. Keep the existing
      precision names working (tests pin them); extend, don't rename blindly.
- [ ] **F4. Crawlable prose + FAQ + keyword flip** (effort S). ~600 words of
      static HTML below the calculator: "How VRAM is calculated" (surface the
      canonical equation), a quick-reference table (7B/13B/70B x
      FP16/8-bit/4-bit), and a visible FAQ targeting real query phrasing
      (70B VRAM, 7B VRAM, LoRA/QLoRA fine-tune VRAM, context length effect,
      larger-than-VRAM models, SDXL VRAM). FAQPage JSON-LD as a bonus (no
      rich-result expectations — Google restricted those in 2023). Flip
      title/H1 to lead with the searched term while keeping breadth:
      title `VRAM Calculator for LLMs, Diffusion & AI Models` (≤60 chars),
      H1 similar. The breadth phrasing is mandatory (Goal #1).
- [ ] **F5. Prerendered per-model pages** (effort M). Static
      `/models/<slug>.html` pages for each preset (reuse `MODEL_PRESETS` ids
      and the 404-page Vite-input pattern), each with baked-in numbers,
      ~300 words, a link into the calculator with the preset's URL state, and
      sitemap entries. Query-param URLs cannot rank — only real paths.
- [ ] **F6. Static $/hr rental estimate** (effort S). Hand-maintained cost
      column on the recommended-GPU examples. No live pricing, no backend.
- [ ] **F7. Inverse mode — "what can my GPU run"** (effort L, last). Pick a
      GPU (or VRAM amount), get the model/quant sizes that fit. We own the
      fit math and hardware data; the work is the curated model list + UI.

Explicitly rejected (do not build): animated inference simulations, live
multi-provider price feeds, model-quality benchmark scores, accounts,
embeddable iframe widget, raw architecture-field forms, exl2 tiers.

## Phase 3 — Distribution (owner tasks, tracked in docs/LAUNCH_TODO.md)

Custom domain before link building; Show HN; r/LocalLLaMA and
r/StableDiffusion posts; replies in the already-ranking HF-forum and Kaggle
threads; awesome-list PRs; README leads with the product (not the loop
harness); GitHub topics.

## Acceptance Criteria (Phase 2)

Done means, for each feature taken on:

1. The feature matches its contract in `specs/frontend.md`.
2. Calculations remain in frontend TypeScript; no backend, no external
   runtime dependency beyond the public HF API for F1 (with manual fallback).
3. Product copy nowhere implies the tool is LLM-only.
4. Unit tests cover the new branches (gate enforces 100%).
5. `pnpm gate` passes.
6. README stays accurate.

> ~~strikethrough~~ strikethrough completed items to clarify what is done
