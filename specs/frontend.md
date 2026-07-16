# Frontend Spec

## Priority

Phase 1 (compact, trustworthy VRAM calculator matching the DC design) is
shipped and live at https://vram.rxdt.dev/. Phase 2 shipped so far: F0
activation floor hotfix (2026-07-16), F3 real quant ladder, and F4 crawlable
prose/FAQ keyword flip (2026-07-15).

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
- Numeric input precision: numeric fields accept UP TO 2 decimal places on
  input (`step=0.01`), needed for values like `gpuResidentFraction` (0.85) and
  `loraTrainablePercent` (0.05%). This relaxes the current 1-decimal input cap
  in `numeric-state.ts`. GB / memory OUTPUTS stay displayed at 1 decimal place.
  Rationale: a competitor survey found free fine-grained inputs cap at
  `step=0.01` (2 decimals); 1-decimal GB display is acceptable though slightly
  coarser than the 2-decimal peer norm.

## Visual Verification Rule (owner mandate, 2026-07-15)

Any UI-affecting change MUST be visually verified before it is called done —
tests and typecheck are not enough. The agent starts the app (dev server or
built `dist` via Playwright under `harness/`) and screenshots it:

- Multiple STATES: default load, a computed result, panels/disclosures open
  and closed, an empty/zeroed form, an extreme-input result.
- Multiple VIEWPORTS: mobile (320 / 390px), tablet, desktop. No horizontal
  scroll at 320/390; no label overlap at ≤30em.
- Various calculator INPUTS across families/modes/precisions.

For each, verify three things and report them: (1) the app LOOKS ok (nothing
visually broken, clipped, overlapping, or unstyled); (2) the OUTPUT numbers are
accurate (spot-check against the formula/anchors, not just "a number appeared");
(3) styling is CONSISTENT across viewports and no element renders "broken"
(mis-aligned chevron, wrong font, spacing unlike the rest of the app, off-theme
color). Attach/save screenshots to the run's report; a claim of "verified"
without screenshots is not verified.

## Release Rule (owner mandate, 2026-07-15)

Before deploying to production, a change must pass TWO independent high-level
reviews — one by Claude and one by Codex — in addition to the automated gate.
A deploy (push to main) happens only after, in order: (1) the automated gate
green (lint, type-check, build, coverage, E2E, Lighthouse), (2) one HIGH-LEVEL
review by Claude, (3) one HIGH-LEVEL review by Codex. High-level means
whole-delta judgment — correctness of the numbers against anchors, user-facing
copy, recommendation behavior changes — not a lint re-run. Reviews go to the
owner; the owner pushes.

## Edge-Case Audit Verdicts (adversarial audit + behavior research, 2026-07-15)

An adversarial audit of the new MoE / LoRA / training / fraction fields plus
a follow-up correctness-research pass produced these verdicts. Fix ONE thing;
the rest are correct-but-silent or intentional and must NOT be changed.

- **FIX — decimal input cap (`numeric-state.ts` `isPlainDecimal`).** The
  1-decimal cap makes URL/field values with 2+ decimals (e.g.
  `gpuResidentFraction=0.75`, `loraTrainablePercent=0.05`) silently revert to
  the field default — for the fraction that default is `1.0` (maximum memory),
  the worst-possible silent flip. Relax to accept up to 2 decimal places per
  the Numeric-input-precision rule above. This is the only calc-layer change
  the audit warrants. Pin it with a test (2-decimal value round-trips through
  the URL unchanged).
- **LEAVE AS-IS — MoE `activeParams = 0`/blank falls back to dense total.**
  0 active params is never a valid MoE config; the fallback-to-total is the
  safest number (treating 0 as literally 0 would floor the speed math to an
  absurd value). Defect is only that it is silent. No math change; an optional
  clarifying comment is fine.
- **LEAVE AS-IS — `gpuResidentFraction` applies only on the known-file weight
  path.** Applying it to the param-count path would scale weights while KV
  cache and activations stay full-size, producing a physically incoherent
  breakdown. Offload is a separate strategy, not a slider on the base
  estimate. This is a LABELING issue, not a math bug: if addressed, clarify in
  the field label / helper text that it modifies the known-file size only — do
  not change `weightsGb`.
- **LEAVE AS-IS (defensible clamps, silent) — do not change behavior:**
  `gpuResidentFraction=0` with a known file → 0 GB (offload-everything reads
  as no-VRAM); `loraTrainablePercent` clamped to 100; known-file bypasses the
  QLoRA 4-bit assumption and Full-training weight formula; `activeParams`
  clamped to `total`. Each is a physically-correct clamp. At most, note in
  spec; no code change.

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

### F4.1 — Relocate the guide, drop the FAQ (owner revision, 2026-07-15)

Supersedes the earlier "collapse both crawlable sections in place" plan. The
standalone `.seo-reference` block below the calculator rendered with spacing
and type that did not match the rest of the app; owner mandate is that these
sections **must match the existing app's disclosure styling exactly**, not
carry bespoke `.seo-*`/`.faq-item` styles.

- **Remove the FAQ entirely for now.** Delete the visible FAQ section AND its
  `FAQPage` JSON-LD in `<head>` together — structured data must not describe
  content absent from the page. The calculator will NOT deploy while the FAQ
  is in its prior (mis-styled) condition. A re-add is a separate future task
  with matching styling.
- **Move "How VRAM is calculated" into the existing right-column
  `.panel-group`** as a fifth `<details class="panel">`, placed immediately
  after "Assumptions used" (siblings: Why this recommendation → Values Used In
  Calculations → Formula used → Assumptions used → How VRAM is calculated). It
  inherits the `.panel` summary/chevron/spacing/font with ZERO new CSS — the
  green downward chevron that rotates up on open comes from the shared
  `.panel summary::after` rule.
- Keep the guide body inside the panel: the formula line (as `<code>`, matching
  the "Formula used" panel), the descriptive paragraph, and the quick-reference
  table with its note. The table stays crawlable HTML inside the closed
  `<details>` (Google indexes closed-disclosure content under mobile-first
  indexing), preserving the F4 SEO value.
- Delete the now-unused `.seo-reference`, `.seo-reference-inner`, `.seo-block`,
  `.seo-block--compact`, `.seo-disclosure`, and `.faq-item` style rules. Retain
  only `.seo-formula`/`.seo-table` (still used by the relocated table/formula)
  if referenced.
- Update/remove tests that pinned the standalone FAQ/guide structure or its
  visibility; e2e overflow/axe/keyboard checks must still pass — the relocated
  guide is reachable and Enter-toggleable like the other panels.
- Hero subtitle ("Estimate the GPU VRAM and hardware tier needed to deploy an
  AI model's workload.") currently orphans "workload." on its own line:
  constrain the paragraph's rendered width to about `34ch` (`max-width: ~34ch`)
  so it wraps to balanced lines and no single word strands on a second line at
  the default desktop viewport. Copy may be shortened instead if cleaner —
  keep the meaning and the non-LLM breadth.
- **Total Model Parameters is a plain text input, never a dropdown/select**
  (owner revert order, 2026-07-15). If any lookup feature (F1) wants to
  suggest values, it must do so without changing this control's type —
  suggestions go in a separate affordance; the field stays free-form
  numeric text with the existing sanitizer.

#### SEO strategy for the crawlable block (research-backed, 2026-07-15)

"SEO-optimized" for this static, client-side, single-page calculator means:
crawlable, keyword-relevant HTML that already exists in the served markup (no
SSR, so anything JS-injected at runtime does not count). Concretely:

- **Dropping the FAQ widget does not require deleting the Q&A meaning.** Google
  stopped showing FAQ rich results for non-gov/health sites in Aug 2023 and
  removed the rich result entirely (May 2026), so the `FAQPage` schema never
  earned a snippet here and is correctly removed with the widget (structured
  data must not describe absent content). But the _answer prose_ still has SEO
  and AI-citation value: LLM answer engines (Perplexity, Copilot, AI Overviews)
  lift self-contained Q&A-shaped chunks, and headings that mirror real queries
  ("how much VRAM for a 70B model") help conventional ranking. So preserve the
  high-value answers as ordinary crawlable prose inside the relocated guide —
  as short question-shaped subheadings + paragraphs — NOT as a styled FAQ
  widget and NOT with `FAQPage` schema. The 70B/7B/context/offload answers are
  already covered by the guide paragraph + quick-reference table; do not
  reintroduce a redundant Q&A list. Keep it lean; a full FAQ re-add with
  matching styling is a separate future task.
- **Collapsed `<details>` is fine for indexing.** Under mobile-first indexing
  Google indexes content inside closed disclosures as long as it is in the
  served HTML (not stripped/JS-gated); it may weight it slightly below
  immediately-visible content. Folding the guide into a `.panel` therefore does
  NOT remove its SEO value — the table and prose stay in the DOM.
- **Content this app should rank for:** headings/prose that mirror
  "how much VRAM for a 70B model", "LLM VRAM calculator", "GPU memory for
  fine-tuning / LoRA / QLoRA". Weave those phrases naturally into the guide
  paragraph, the table caption, and any subheadings — do not keyword-stuff. The
  quick-reference table (7B/13B/70B x FP16/8-bit/4-bit) is the single strongest
  crawlable asset and is pinned to `buildReport` output by test.
- **Technical SEO already in place:** single H1 (hero), semantic headings,
  `canonical`, OG + Twitter tags, `WebApplication` JSON-LD, `robots` meta +
  `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`, descriptive
  `og:image:alt`. Gap to revisit later (not this task): sitemap lists only `/`
  — F5's per-model pages must add sitemap entries when they ship.

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

- F0 — Activation floor hotfix (2026-07-16): decoder inference activation
  scratch is estimated from fp16-equivalent model weights, clamps to a 0.5 GB
  floor, keeps 70B default activations in the 1-3 GB anchor envelope, and the
  assumptions panel names fp16 compute precision.
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
