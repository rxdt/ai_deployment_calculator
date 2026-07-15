# Frontend Spec

## Priority

Phase 1 (compact, trustworthy VRAM calculator matching the DC design) is
~~shipped~~ — live at https://vram.rxdt.dev/ with the gate
green. Current priority: the Phase 2 features below, in order, one at a time,
gate-green after each. Feature rationale and priority live in `specs/plan.md`.

## Phase 2 Feature Contracts

Shared rules for every feature: calculations stay in the existing TypeScript
sources (`calculator-core.ts`, `workload-memory.ts`, `report.ts`); UI copy
must never imply the tool is LLM-only; existing preset/URL-state behavior must
keep working (tests pin it); match existing file structure and comment voice.

### F1 — Hugging Face model lookup (M)

- New input affordance in the Model fieldset: a typeahead search box querying
  `https://huggingface.co/api/quicksearch?q=...&type=model` client-side;
  picking a result fetches `https://huggingface.co/<id>/resolve/main/config.json`
  and, when present, `model.safetensors.index.json` (exact param count from
  tensor shapes).
- Fills: total params, parameter unit, and (internally) layers, hidden size,
  and `num_key_value_heads`. When real KV-head counts are known, the KV-cache
  formula must use them instead of the GQA=8 assumption; the assumptions
  panel must say which source was used.
- Failure modes: offline, CORS hiccup, gated model (401/403 on config.json) →
  quiet fallback to manual entry with a one-line note; never block the form.
  No API keys, no backend, single fetch per selection (no retry storms).
- Resolved architecture participates in URL state so deep links stay
  reproducible (encode the resolved numbers, not just the HF id).
- Tests: mock fetch in unit tests (jsdom); the gate must NOT hit the network.
  One e2e may exercise the manual-fallback path only.

### F2 — Layer-offload output (S, after F1)

- When required memory exceeds the recommended/selected single card's usable
  VRAM, add a report row: "N of L layers fit on the GPU (X.X GB/layer);
  offload the rest to CPU at reduced speed."
- Layer count: F1 metadata when present, else the existing architecture
  estimate table. Per-layer GB = resident weight GB / layers; state that
  simplification in the assumptions panel.
- Only for layered transformer workloads (text_generation, text_encoder,
  encoder_decoder, vision_language). Never for diffusion/video/audio/tabular.

### F3 — Real quant ladder (S)

- Extend `PRECISION_MAP` (calculator-core.ts) and the `precision` schema
  (state.ts) with published GGUF bits-per-weight entries: IQ1_S 1.56,
  IQ2_XXS 2.06, IQ3_XXS 3.06, Q4_K_M 4.85, Q5_K_M 5.69, Q6_K 6.59, Q8_0 8.5,
  plus INT2 (0.25 B/param) and INT3 (0.375 B/param).
- Existing options ("4-bit", "5-bit GGUF", "6-bit GGUF", "8-bit", "16-bit",
  "32-bit") keep their names and values — tests and URL state pin them. New
  entries are additions to the select, grouped so the list stays scannable
  (consider `<optgroup>`).
- QLoRA stays pinned to the existing "4-bit" (NF4) — the new GGUF tiers must
  not leak into the QLoRA constraint logic.

### F4 — Crawlable prose + FAQ + keyword flip (S)

- Below `<main>`, static HTML (crawlable without JS): a short "How VRAM is
  calculated" section surfacing
  `Required_GB = (Weights + Working_Memory + Training_State + Runtime_Overhead) x Buffer`,
  a quick-reference table (7B/13B/70B x FP16/8-bit/4-bit — numbers must equal
  what the calculator computes; pin with a unit test), and a visible FAQ
  (6-8 questions in real query phrasing: how much VRAM for a 70B model / a 7B
  model, LoRA vs QLoRA fine-tuning VRAM, does context length affect VRAM,
  can I run a model bigger than my VRAM — answer references offloading/F2,
  how is VRAM calculated, how much VRAM does SDXL need).
- Title/H1 flip with breadth mandatory: title
  `VRAM Calculator for LLMs, Diffusion & AI Models` (≤60 chars), H1 to match,
  meta description naming inference, fine-tuning, and diffusion/video.
  og:title / twitter:title / JSON-LD `name` updated consistently.
- FAQPage JSON-LD mirroring the visible FAQ (bonus only — no rich-result
  expectations; the visible text is the point).
- Several tests pin the current title/H1 strings — they move WITH this
  requested copy change: grep `VRAM Deployment Calculator` and
  `AI Deployment Calculator` across `frontend/src/*.test.ts` and
  `frontend/tests/*.spec.ts` first.
- The prose follows the tool; the calculator must not drop below the fold.

### F5 — Prerendered per-model pages (M)

- One static page per preset at `/models/<preset-id>` via additional Vite
  rollup inputs (same pattern as the 404 page in `harness/vite.config.ts`,
  cleanUrls serving).
- Each page: H1 "<Model> VRAM requirements", the preset's baked-in numbers
  (weights, total, recommended tier — must equal the calculator's output for
  that preset; pin with a unit test), ~300 words, a prominent link into `/`
  carrying the preset's URL state, canonical to itself, sitemap.xml entries,
  and a footer link from the main page so crawlers find them.
- Reuse `MODEL_PRESETS` ids as slugs.

### F6 — Static $/hr rental estimate (S)

- Hand-maintained `costPerHourUsd?: number` on GPU example cards
  (hardware.ts); render "~$X.XX/hr rented" beside examples that have it. A
  dated comment states the source month. No live pricing, no backend.

### F7 — Inverse mode (L, last)

- "What can my GPU run?" — pick a GPU (reuse tier/example data) or enter
  VRAM; list preset models x quant tiers that fit at the usable-VRAM target,
  each row linking into the calculator. Do not start until F1–F6 ship and the
  owner re-prioritizes.

## Checks

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Full unit + coverage: `pnpm --dir frontend run test:coverage` (gate enforces
  100% statements AND branches).
- Focused e2e (dev server auto-starts):
  `cd harness && npx playwright test ../frontend/tests/<spec> --project=desktop-chrome`
- Required loop checks: `pnpm preflight`, then `pnpm gate` (run once per
  significant change; Lighthouse makes it slow).

## Gate Landmines (learned 2026-07-12 — read before looping)

- `eslint-disable`, `ts-ignore`, and `.only(` are FORBIDDEN PATTERNS — the
  pre-push harness reports them and blocks. Fix the code, never suppress.
- `frontend/src/app.ts` has a 300 code-line cap and sits near it: put new DOM
  helpers in `app-dom.ts` (exported, JSDoc'd) instead of growing app.ts.
- `@typescript-eslint/no-unsafe-type-assertion` bans `as` narrowing — use
  Maps/type predicates (patterns: `activePreset` in presets.ts,
  `searchFromState` in state.ts).
- sonarjs bans `test.skip(...)` inside describes; top-of-file conditional
  skips are fine (see calculator-parity.spec.ts, large-desktop.spec.ts).
- stylelint: no qualifying type selectors (`a[href]`), ascending-specificity
  ordering for anchor rules (link overrides live together near `.topnav a`),
  `comment-empty-line-before`.
- Playwright `getByLabel("Precision")` also matches "KV Cache Precision" —
  use `{ exact: true }` for any label that prefixes another.
- html-validate: no redundant ARIA (`role="status"` on `<output>`), no
  `target`/`rel` on href-less anchors; Lighthouse crawlable-anchors fails
  href-less `<a>` — swap the href, never strip it.
- The ONLY pnpm workspace root is the repo root `pnpm-workspace.yaml`; the
  only lockfile is the root `pnpm-lock.yaml`. NEVER create nested workspace
  files or lockfiles (they fork the store and break playwright); nested
  lockfile paths are on the forbidden list on purpose.
- Toolchain deps use loose "latest" pins — avoid un-frozen installs;
  TypeScript 7 via `latest` already broke eslint+tsc once. CI is
  `--frozen-lockfile`.
- Port 5173: other projects' dev servers sometimes squat it, and playwright's
  `reuseExistingServer` will then test the WRONG app. Verify
  `curl -s localhost:5173 | grep -o '<title>[^<]*'` mentions the VRAM
  calculator before trusting e2e results.
- Unchecked-checkbox semantics: enabled unchecked checkboxes submit "off"
  (`inputEntry` in app-dom.ts) so default-true booleans can actually be
  turned off. Preserve this in any form-serialization change, and test BOTH
  check directions.
- The e2e matrix includes WebKit: attribute-flip restyling via CSS sibling
  selectors silently fails there — set visibility in JS (see
  `renderFitMeterBar`).

## Notes

- The reference files are distilled notes, not raw third-party exports, so
  the repo-wide HTML validator can check them.
- The design bundle under `scratchpad/` (git-ignored) remains the visual
  reference; Phase 2 UI must reuse the existing tokens in `styles.css`, not
  ad-hoc colors.
