# AI Deployment VRAM Calculator Plan

## Goal

Build a GPU VRAM calculator that is usable for non-technical users and
trustworthy for engineers. **P0: veracity and accuracy above all.** Wrong
numbers are worse than no app. Numbers must trace to Research Corrections and
published anchors, not competitor shortcuts or guesses; assumptions must be
auditable in `Advanced assumptions`; undefended values must not ship.

The app covers text, embeddings, encoder-decoder, vision, multimodal, image
diffusion, video, audio, tabular, and custom workloads. Never brand it as
LLM-only. Keep formulas in frontend TypeScript and expose enough math for
engineers to audit recommendations.

Workload family names: `text_generation`, `text_encoder`, `encoder_decoder`,
`vision`, `vision_language`, `image_diffusion`, `video_generation`, `audio`,
`tabular`, `custom`.

Commands: `pnpm preflight`, `pnpm gate`; QA contracts live in `specs/qa.md`.

## Spec Hygiene

- Claim one unclaimed spec first and commit that claim before other edits.
- Shrink completed contracts out of specs; status notes go in
  `docs/PROJECT_STATUS.md`.
- Release the claim last. End with a committed, clean tree.
- Multiple agents share `main`; keep both sides of committed work on clashes.

## Research Corrections

- Required_GB = (Weights_GB + Working_Memory_GB + Training_State_GB +
  Runtime_Overhead_GB) * Buffer.
- KV cache is only for autoregressive/generative transformer workloads and uses
  architecture, sequence length, concurrency, and KV precision. Never use
  `KV = Active_P / 10`.
- Training VRAM is not `P * 16`; LoRA trains adapters; QLoRA uses a frozen
  4-bit base plus adapter state.
- Known model file size overrides parameter-based weights.
- MoE active parameters affect rough speed, not resident weight memory, unless
  expert offload/sharding is enabled.
- Use real GGUF bits-per-weight (Q4_K_M = 4.85 bpw) and real KV heads when
  known; do not copy GiB-as-GB or MHA-only shortcuts.
- Inference activation scratch is fp16 compute-buffer behavior, not quantized
  resident weight size. Anchors of record (llama.cpp compute-buffer logs,
  summed across GPUs): 70B@8k = 2208 MiB ≈ 2.32 GB (#7804, 1104 MiB × 2 GPUs);
  70B@32k = 4224 MiB ≈ 4.43 GB (#10003); 0.5 GB floor. Clamp at the anchors —
  never extrapolate past 32k, never take a single-GPU buffer.
- Displayed memory requirements and hardware sizing values round upward, never
  down, at one decimal place so boundary cases cannot fit an undersized tier.

## Source Separation (owner directive 2026-07-16, standing invariant)

`frontend/index.html` contains markup only:

- No inline `<style>` blocks and no `style=` attributes: all CSS lives in
  `frontend/src/styles.css`.
- No inline executable `<script>` bodies: all JavaScript/TypeScript lives in
  `.ts`/`.js` files under `frontend/src/` (the external
  `<script type="module" src=...>` entry tag is markup, not inline code).
- Exemption: the single `<script type="application/ld+json">` structured-data
  block stays inline — it is inert data, the documented SEO pattern, and not
  executable JavaScript.
- NO new files for this: `src/main.ts` and `src/styles.css` are the homes.
- Build output (REVISED by owner 2026-07-16): the single-file inlining
  exemption is REVOKED — the P1 CSP task below externalizes built JS/CSS so
  `script-src 'self'; style-src 'self'` holds on the OUTPUT too. `pnpm gate`
  must stay green.

## Current Work

Shipped work is recorded in `docs/PROJECT_STATUS.md`, not here.

Parked by owner directive (2026-07-16): F1, F2, F5, F6, F7, F8. Do not build.
Rationale: `scratchpad/DO-NOT-DO-phase2-features.md`.

### PRIORITIES

- **P2 — BUG: topnav brand + GitHub chip degrade on narrow viewports.** No
  horizontal scroll remains (verified 320/390/768 on 2026-07-16), but at
  ≤390px the brand "~VRAM-calculator" wraps mid-word ("calculat/or") and the
  GitHub chip renders as a near-empty circle. Fix: let the topnav wrap or
  shrink/abbreviate brand + chip on narrow viewports; verify visually at
  320/390px.
- **P1 — CSP + no-inline build, gh_site pattern (owner directive 2026-07-16).**
  Mirror what the owner's other loopgate_js demo app (`~/gh_site`,
  rxdt.github.io) already shipped; its commits are the reference
  implementation:
  - `b7dcc00` — pinned meta-CSP: `CSP_POLICY = "default-src 'self';
script-src 'self'; style-src 'self'; img-src 'self' data:; media-src
'self'"` exported from the harness vite config; a `cspMeta()`
    transformIndexHtml plugin prepends it as a `<meta http-equiv>` tag on
    every built page; `harness/csp.test.ts` builds to a throwaway temp dir
    and asserts on OUTPUT that every page carries the exact pinned CSP and
    contains no executable inline JS and no inline CSS (JSON-LD and other
    data `<script>` types exempt — CSP script-src does not govern them).
  - `72c2934` — hardening: the csp test also rejects inline `on*=` event
    handlers and `javascript:` URLs on every element.
  - `2f73254` — no-bundle output: drop the Vite module entry (it emits
    `index-*.js` + modulepreload, creating a Lighthouse critical
    dependency); serve JS as deferred classic scripts from `public/` with
    `<body hidden>` unhidden by the style-adopting script, keeping zero CLS
    with an empty critical chain.
    CONSEQUENCE for this repo: the current single-file inlining of JS/CSS into
    `dist/index.html` is REPLACED by external `'self'` scripts/styles — this
    supersedes the "build output is exempt / do not change inlining" line in
    Source Separation (owner reversed that trade for CSP). `harness/` files
    (vite config, csp test) are FORBIDDEN to agents: agents do the
    frontend-side work (external script/style wiring, no inline anywhere,
    removing anything the csp test flags) and the owner lands the harness-side
    plugin + test, copied/adapted from gh_site. Gate must stay green,
    including Lighthouse.
- **P2 — Security response headers (owner-approved 2026-07-16).** Vercel can
  set real HTTP headers (unlike GitHub Pages), so ALSO add a `headers` block
  to `vercel.json` (agent-editable) applied to `/(.*)`:
  `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`;
  `Referrer-Policy: strict-origin-when-cross-origin`;
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`; and
  `Content-Security-Policy` equal to the pinned CSP_POLICY once the P1 CSP
  work lands (header + meta may coexist; header is authoritative).
  Agents verify JSON shape and gate; live-header confirmation
  (`curl -sI https://vram.rxdt.dev/`) is an owner post-deploy step.
- **P2 — "About" navbar link + writeup page (owner request 2026-07-16).** The
  owner's writeup was copied into the repo at
  `frontend/public/calculator-writeup.html` (served as
  `/calculator-writeup` via cleanUrls). Tasks: (1) add a navbar link with
  visible text "About" pointing to `/calculator-writeup`, matching existing
  `.topnav` chip markup/style, without worsening the ≤390px topnav overflow
  (see that P2 bug); (2) make the copied page work standalone in THIS site:
  it references `./scripts/calculator-writeup.js` (does not exist here — drop
  or replace the tag per the Source Separation rules) and carries
  gh_site-local nav links (`href="/"` "Rox dT" / "Back to Rox dT") that
  should point somewhere sensible from vram.rxdt.dev (owner's home site or
  the calculator root). It ships unstyled; style it consistently with the
  app using `src/styles.css` or a second stylesheet ONLY if the Source
  Separation no-new-files rule is amended by the owner — otherwise minimal
  inline-free markup is acceptable. Gate must stay green (html-validate
  covers `**/*.html`).
- **P2 — Screenshot hygiene in `scratchpad/` (owner request 2026-07-16).**
  Existing screenshots there (e.g. `live-checkboxes.png`, 2026-07-12) are
  stale and may mislead. Update/retake them ONLY IF agents will actually use
  them during development (e.g. visual regression reference); otherwise
  delete them. The owner validates where any new screenshot is taken from
  (local build when ready, or production) — record the question in
  `docs/PROJECT_STATUS.md` and wait for the owner's answer before capturing.
- **P2 — F10. Adversarial oracle suite.** Extend
  `frontend/src/adversarial/oracle.test.ts` with one missing
  weird-combination/oracle case from external calculators, published anchors, or
  physical invariants. Incorrect-source failures stay red.
- **P3 — UX findings from the 2026-07-16 naive-user verification pass**
  (two independent agent testers; details in `docs/PROJECT_STATUS.md`):
  Active Parameters accepts values above total params with no warning; tier
  table has label gaps (25–31, 49–63, 97–140 GB); Headroom reads "0%" at
  overload instead of signaling negative. All non-blocking; triage before
  building.

Rejected: animated inference simulations, live price feeds, benchmark scores,
accounts, iframe widget, raw architecture-field forms, exl2 tiers.

Owner-only tasks (deploy, device pass) live in `docs/PROJECT_STATUS.md`.

## Acceptance

Match the relevant spec, keep calculations in frontend TypeScript, avoid
LLM-only copy, cover behavior with challenging tests, pass `pnpm gate` unless a
QA oracle is intentionally red, and keep README/status/specs accurate.

## Blockers

- None.
