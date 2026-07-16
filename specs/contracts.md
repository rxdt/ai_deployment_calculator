# Phase 2 Feature Contracts

Remaining unshipped features, one per loop run (see `specs/frontend.md` for
rules). Strike/delete each when done; when this file is empty, delete it.

## F1 — Hugging Face model lookup (M)

- Model-fieldset typeahead querying
  `https://huggingface.co/api/quicksearch?q=...&type=model` client-side.
- Selecting a result fetches
  `https://huggingface.co/<id>/resolve/main/config.json` and, when present,
  `model.safetensors.index.json` for exact tensor-shape parameter counts.
- Fill total params, parameter unit, and internally layers, hidden size, and
  `num_key_value_heads`; real KV-head counts replace the GQA=8 assumption, and
  assumptions must name the source used.
- Offline/CORS/gated 401/403 failures quietly fall back to manual entry with a
  one-line note; never block the form. No API keys/backend/retry storms.
- URL state stores resolved numbers, not just the HF id.
- Tests mock fetch in jsdom; gate must not hit the network. One e2e may cover
  the manual fallback path only.
- Total Model Parameters stays a free-form numeric text INPUT — any suggestion
  UI is a separate affordance, never a dropdown replacing the field.

## F2 — Layer-offload output (S, after F1)

- When required memory exceeds the recommended/selected single card's usable
  VRAM, add: "N of L layers fit on the GPU (X.X GB/layer); offload the rest to
  CPU at reduced speed."
- Layer count from F1 metadata when present, else the architecture estimate
  table. Per-layer GB = resident weight GB / layers, simplification stated in
  assumptions.
- Only layered transformer workloads: text generation, text encoder,
  encoder-decoder, vision-language.

## F5 — Prerendered per-model pages (M)

- One static page per preset at `/models/<preset-id>` via additional Vite
  rollup inputs, following the 404-page pattern in `harness/vite.config.ts`.
- Each page: H1 "<Model> VRAM requirements", baked-in weights/total/tier
  matching calculator output, ~300 words, canonical URL, sitemap entry, footer
  discovery link, prominent URL-state link back into `/`.
- Reuse `MODEL_PRESETS` ids as slugs. (Must add sitemap entries — today
  `public/sitemap.xml` lists only `/`.)

## F6 — Static $/hr rental estimate (S)

- Add hand-maintained `costPerHourUsd?: number` to GPU example cards in
  `hardware.ts`; render "~$X.XX/hr rented" beside examples that have it.
- Dated source-month comment. No live pricing or backend.

## F8 — Hardware catalog refresh (S, recurring)

- Only when no other unchecked feature is actionable. One pass: HEAD-check every
  `GPU_LINKS` URL (report, don't guess), fix dead links with the vendor's
  canonical page, add at most 2 newly common SKUs to the correct tier with
  tests updated (pattern: the 2026-07-15 MI300X addition), refresh
  `costPerHourUsd` if F6 shipped (dated comment).
- No tier restructuring, no threshold changes — data only.

## F7 — Inverse mode (L, last)

- "What can my GPU run?" Pick a GPU or enter VRAM; list preset models by quant
  tier that fit the usable-VRAM target, each linking into the calculator.
- Do not start until F1-F6 ship and the owner re-prioritizes.

## SEO rule for any future crawlable content (e.g. FAQ re-add)

Static client-side app (no SSR) — only served HTML counts. Keep a single H1
(hero). Content in closed `<details>` is still indexed (mobile-first). Do NOT
use `FAQPage` schema (Google removed the FAQ rich result, May 2026) — write
Q&A as ordinary crawlable prose/subheadings that mirror real queries ("how much
VRAM for a 70B model", "GPU memory for LoRA/QLoRA"). The 7B/13B/70B ×
FP16/8-bit/4-bit table (pinned to `buildReport`) is the strongest asset. Match
existing `.panel` styling — no bespoke SEO CSS.

## Checks / Gate Landmines

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Full: `pnpm --dir frontend run test:coverage`; then `pnpm preflight`, final
  `pnpm gate`.
- No lint-disable comments, TypeScript ignore comments, focused-test markers,
  skips, or broad suppression.
- Forbidden paths: `harness/`, `.github/`, `.githooks/`, `pyproject.toml`,
  `PROMPT.md`, `AGENTS.md`.
- TS lint bans unsafe `as`; prefer schemas/Maps/type-predicates. Stylelint
  dislikes qualifying selectors + descending specificity. Playwright
  `getByLabel("Precision")` needs `{ exact: true }`.
