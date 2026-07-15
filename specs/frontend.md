# Frontend Spec

## Priority

Phase 1 (compact, trustworthy VRAM calculator matching the DC design) is
shipped and live at https://vram.rxdt.dev/. Phase 2 shipped so far: F3 real
quant ladder and F4 crawlable prose/FAQ/keyword flip (both 2026-07-15).

Current priority: finish F1, F2, F5, F6, then F7 one at a time, gate-green
after each. Feature rationale lives in `specs/plan.md`.

## Shared Rules

- Calculations stay in `calculator-core.ts`, `workload-memory.ts`, and
  `report.ts`.
- UI copy must not imply the tool is LLM-only.
- Existing preset and URL-state behavior must keep working; tests pin it.
- Match existing file structure, tokens, and comment voice.
- `app.ts` is near the 300 code-line cap; new DOM helpers belong in
  `app-dom.ts` with exported JSDoc.

## Loop Discipline (finish, don't dally)

1. Pick the FIRST unchecked feature in `specs/plan.md` Phase 2 whose
   dependencies are met. One feature per run — never two.
2. Read Gate Landmines below BEFORE writing code; every landmine has already
   cost a full debugging cycle once.
3. Definition of done, all four or it is not done: (a) the contract below is
   met exactly; (b) `pnpm gate` exits 0; (c) the item is struck `[x]` in
   `specs/plan.md` with a one-line DONE note; (d) work is committed with a
   descriptive message.
4. No drive-by refactors, no renames, no style migrations, no scope
   extensions outside the feature's contract. If you see an unrelated
   problem, append one line to `docs/LAUNCH_TODO.md` and keep moving.
5. If the same gate check fails 3 consecutive attempts, STOP: revert to the
   last green state, write the blocker (symptom, attempts, hypothesis) under
   a `## Blockers` heading in `specs/plan.md`, and end the run. Thrashing
   burns the budget the next feature needs.
6. Never edit another feature's primary files in the same run; never touch
   `harness/` config except where a contract explicitly says so.

## Remaining Phase 2 Contracts

### F1 — Hugging Face model lookup (M)

- Add a Model-fieldset typeahead querying
  `https://huggingface.co/api/quicksearch?q=...&type=model` client-side.
- Selecting a result fetches
  `https://huggingface.co/<id>/resolve/main/config.json` and, when present,
  `model.safetensors.index.json` for exact tensor-shape parameter counts.
- Fill total params, parameter unit, and internally layers, hidden size, and
  `num_key_value_heads`; real KV-head counts must replace the GQA=8 assumption,
  and assumptions must name the source used.
- Offline, CORS, and gated 401/403 failures quietly fall back to manual entry
  with one-line note; never block the form. No API keys/backend/retry storms.
- URL state stores resolved numbers, not just the HF id.
- Tests mock fetch in jsdom; gate must not hit the network. One e2e may cover
  the manual fallback path only.

### F2 — Layer-offload output (S, after F1)

- When required memory exceeds the recommended/selected single card's usable
  VRAM, add: "N of L layers fit on the GPU (X.X GB/layer); offload the rest to
  CPU at reduced speed."
- Layer count comes from F1 metadata when present, otherwise the architecture
  estimate table. Per-layer GB = resident weight GB / layers, with that
  simplification stated in assumptions.
- Only for layered transformer workloads: text generation, text encoder,
  encoder-decoder, and vision-language.

### F5 — Prerendered per-model pages (M)

- Add one static page per preset at `/models/<preset-id>` via additional Vite
  rollup inputs, following the 404-page pattern in `harness/vite.config.ts`.
- Each page has H1 "<Model> VRAM requirements", baked-in weights/total/tier
  matching calculator output, about 300 words, canonical URL, sitemap entry,
  footer discovery link, and a prominent URL-state link back into `/`.
- Reuse `MODEL_PRESETS` ids as slugs.

### F6 — Static $/hr rental estimate (S)

- Add hand-maintained `costPerHourUsd?: number` to GPU example cards in
  `hardware.ts`; render "~$X.XX/hr rented" beside examples that have it.
- Include a dated source-month comment. No live pricing or backend.

### F8 — Hardware catalog refresh (S, recurring)

- Take only when no other unchecked feature is actionable. One pass per run:
  HEAD-check every `GPU_LINKS` URL (report, don't guess), fix dead links with
  the vendor's canonical product page, add at most 2 newly common SKUs to the
  correct tier with tests updated (pattern: the 2026-07-15 MI300X addition in
  `hardware.ts` + `hardware.test.ts`), and refresh `costPerHourUsd` values if
  F6 has shipped (dated comment).
- No tier restructuring, no threshold changes — data only.

### F7 — Inverse mode (L, last)

- "What can my GPU run?" Pick a GPU or enter VRAM; list preset models by quant
  tier that fit the usable-VRAM target, each linking into the calculator.
- Do not start until F1-F6 ship and the owner re-prioritizes.

## Shipped Phase 2

- F3 — Real quant ladder (2026-07-15): added GGUF bpw tiers (`IQ1_S`,
  `IQ2_XXS`, `IQ3_XXS`, `Q4_K_M`, `Q5_K_M`, `Q6_K`, `Q8_0`) plus `INT2` and
  `INT3`; existing option values stayed stable; QLoRA remains pinned to the
  existing `"4-bit"` NF4 path.
- F4 — Crawlable prose + FAQ + keyword flip (2026-07-15): title/H1/meta/social
  names changed to "VRAM Calculator for LLMs, Diffusion & AI Models"; below-main
  static "How VRAM is calculated", quick-reference table, visible FAQ, and
  FAQPage JSON-LD shipped. Tests pin metadata, FAQ mirroring, and table values
  against `buildReport`.

## Checks

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Full unit + coverage: `pnpm --dir frontend run test:coverage`.
- Required loop checks: `pnpm preflight`, then final `pnpm gate`.

## Gate Landmines

- Lint-disable comments, TypeScript ignore comments, focused-test markers,
  skipped/xfail tests, and broad suppressions are forbidden.
- Use `rg`, targeted reads, and no forbidden paths. Do not touch `harness/`,
  `.github/`, `.githooks/`, `pyproject.toml`, `PROMPT.md`, or `AGENTS.md`.
- TypeScript lint bans unsafe `as` narrowing; prefer schemas, Maps, and type
  predicates. Stylelint dislikes qualifying selectors and descending
  specificity. Playwright `getByLabel("Precision")` needs `{ exact: true }`.
