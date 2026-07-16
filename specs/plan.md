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
- (2026-07-15 owner review; grounded against llama.cpp allocation logs)
  Inference activation scratch is currently derived from resident weight
  bytes, so a quantized model wrongly shows smaller activations than its
  fp16 twin. Reality: activations are computed in fp16 regardless of weight
  quant, and the peak is PREFILL compute buffers (prompt ingestion), roughly
  bounded by chunk-tokens x intermediate size x 2 bytes and capped by
  micro-batch chunking — not a clean function of context (llama.cpp
  maintainers confirm no closed form exists). Re-key the heuristic on
  architecture (fits F1's data) and pin the fix against measured anchors:
  Llama-3 70B @ 8k ctx = 2,270 + 1,104 MiB compute buffers (split across two
  devices); 70B @ 4k chunked = 507 MiB; largest single 70B activation
  (MLP up_proj) ~0.3 GB per batch element. Target envelope ~1-3 GB for 70B
  at 4-8k, scaling down with model size.
  (github.com/ggml-org/llama.cpp discussions 9784, 9936, 10068)

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

- [x] ~~**F0. Activation floor hotfix** (effort S).~~ DONE 2026-07-16:
      decoder-family inference activation scratch uses fp16-equivalent model
      weights instead of selected quantized weights, clamps at 0.5 GB, keeps
      70B default activation memory in the 1-3 GB anchor envelope, updates the
      assumptions note, and refreshes the crawlable quick-reference values.
- [ ] **F1. Hugging Face model lookup** (effort M). Client-side, no backend:
      HF quicksearch API for typeahead, then `config.json` (+ safetensors
      index when present) for exact params, layers, hidden size, and
      `num_key_value_heads`. Fills the form; manual entry stays as the
      fallback (gated models 401 on config fetch — degrade gracefully).
      Fixes the GQA correction above with real KV-head counts. Also replaces
      the F0 interim activation floor with architecture-keyed prefill math.
- [ ] **F2. Layer-offload output** (effort S once F1 lands). When the model
      does not fit the selected/recommended GPU, output "N of L layers fit on
      GPU, rest to CPU" with the per-layer GB figure. Layers come from F1 or
      the existing architecture table. This converts a dead-end "does not
      fit" into an actionable answer for the Ollama/llama.cpp audience.
- [x] ~~**F3. Real quant ladder** (effort S). Replace generic bit-widths with
      real bits-per-weight: GGUF IQ1_S 1.56 … Q4_K_M 4.85 … Q8_0 8.5, plus
      INT2 (0.25 B/param) and INT3 (0.375 B/param) tiers. Keep the existing
      precision names working (tests pin them); extend, don't rename blindly.~~
      DONE 2026-07-15: nine tiers added to `PRECISION_MAP`, the `Precision`
      type, the `precision` URL schema, and a grouped `<optgroup>` select;
      GGUF bpw folds block-scale metadata so overhead is 1; QLoRA still pins
      the existing 4-bit NF4 base.
- [x] ~~**F4. Crawlable prose + FAQ + keyword flip** (effort S).~~ DONE
      2026-07-15: "How VRAM is calculated" section, FAQ, FAQPage JSON-LD, and
      the breadth-keeping H1/title flip shipped as static HTML below the
      calculator.
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
- [ ] **F8. Hardware catalog refresh** (effort S, recurring — take when no
      other item is actionable). Verify every `GPU_LINKS` URL still resolves,
      add newly common SKUs to the right tier (2026-07-15 added MI300X 192 GB
      this way), refresh F6 prices once they exist, and correct dead links.
      One PR-sized pass per run; log what was checked in the commit message.
- [ ] **F9. Cross-calculator QA run** (effort S, recurring, report-only —
      full contract in `specs/qa.md`). Drive the primary competitor
      calculators (apxml, vram.asmirnov.xyz, the SadP0i GGUF Space) with our
      canonical scenarios, compare per-component numbers against the live
      site, triage every disagreement against published anchors, and write
      `docs/qa/comparison-YYYY-MM-DD.md`. Never edits product code — "our
      error" findings become dated Research Corrections here. Run after every
      formula-affecting change (F0/F1/F3-class) and before distribution
      pushes.
- [ ] **F10. Adversarial oracle suite** (effort M first run, then recurring —
      full contract in `specs/qa-adversarial.md`). Red-team the math: audit
      existing tests for tautologies and one-way coverage, then write
      adversarial and weird-combination cases in
      `frontend/adversarial/oracle.test.ts` — a suite deliberately OUTSIDE
      the gate's glob — whose assertions come only from external calculators,
      published anchors, and physical invariants, never our own equations.
      Failures caused by incorrect source stay RED as living bug reports,
      each filed as a dated Research Correction naming the red test as
      reproducer. Lint must pass; assertions may fail.

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

## Blockers

- **Untracked forbidden QA harness files block preflight/gate (2026-07-16).**
  Symptom: `pnpm preflight` fails Prettier on `harness/qa-*.mjs`; final
  `pnpm gate` passes F0 lint/type/build/coverage/E2E/Lighthouse but fails on
  those forbidden files via Prettier, knip deadcode, and cspell fallout.
  The commit hook fails on the same Prettier check. Attempts: F0-owned
  lint/test/E2E failures were fixed; the remaining files are under forbidden
  `harness/`. Owner must clean or remove them before commits can pass hooks.
- **The harness DOM-selector gate freezes `app-dom.ts` and `app.ts` (2026-07-15).**
  Symptom: committing F6 was rejected with
  `app-dom.ts:...: unlisted data-* selector '[data-tier-fit]'`. Attempts:
  F6 passed `test:coverage` (100% branches) and `preflight`, but the commit
  hook's `preferenceProblems` check scans full staged `.ts` content against
  `ALLOWED_TS_DOM_DATA_SELECTORS` in `harness/preferences.ts`, which omits
  `[data-tier-fit]` (used by the untouched `renderTierFits`). `app.ts` is
  frozen too — its `hideSlots` uses `querySelectorAll(variable)`, flagged as a
  dynamic selector. Hypothesis: the allowlist was tightened after `app-dom.ts`
  was last committed (`549d433`), leaving a latent trap no loop hit until a UI
  feature touched those files. Fix is owner-only (forbidden `harness/` path):
  add `[data-tier-fit]` to the allowlist and permit the `hideSlots` pattern.
  Blocks F1, F2, F5–F7 UI work; F6 was implemented and reverted to keep a
  green tree. Detail in `docs/PROJECT_STATUS.md` and `UPSTREAM.md`.
