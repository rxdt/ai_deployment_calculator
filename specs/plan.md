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
  resident weight size; keep 70B 4-8k context near the 1-3 GB measured-anchor
  envelope until architecture-keyed prefill math lands.

## Current Work

Shipped: F0 activation floor, F3 quant ladder, F4 crawlable prose, F4.1 guide
relocation/FAQ removal, the decimal-input fix, and the context-anchored decoder
activation scratch (`decoder-scratch.ts`, verified against llama.cpp anchors).
`specs/frontend.md` was deleted because no frontend build item remained.

Parked by owner directive (2026-07-16): F1, F2, F5, F6, F7, F8. Do not build.
Rationale: `scratchpad/DO-NOT-DO-phase2-features.md`.

### PRIORITIES (exactly one P0; everything else is P1/P2)

- **P0 — The LIVE public site serves WRONG numbers.** https://vram.rxdt.dev/
  runs the stale pre-F0 bundle (7B default = 19.0 GB; correct = 18.8) and lacks
  F3/F4/F4.1. `main` is INDEPENDENTLY VERIFIED (2026-07-16) as strictly better,
  no regressions: activation now context-anchored (70B 2.32→4.36 GB across
  8k→32k, cites llama.cpp #7804/#10003); 70B@8k total = 161.1 GB reproduced by
  hand from anchors; fp16=params×2 and KV=0.125 MiB/tok (vLLM) exact; GSC tag
  value matches live; brand H1 "AI Deployment Calculator" already matches live
  (deploy does NOT rebrand); 279 tests / 100% cov / gate green. SEO
  reconciliation complete (GSC, sitemap/robots on vram.rxdt.dev, brand). Local
  build/preflight/gate passed, and Codex review is recorded; the required Claude
  review is blocked by CLI auth. Nothing outranks getting this correct,
  non-regressing build deployed. **ONLY THE OWNER DEPLOYS.** Treat any accuracy
  regression on `main` as a release blocker, not a backlog item.
- **P1 — Guard the accuracy that was just fixed.** Add a direct unit test for
  `decoder-scratch.ts` pinning its cited anchors (≈2.2 GB @8k, ≈4.2 GB @32k for
  70B; the 0.5 GB floor) and the context-growth invariant, so the formula can't
  silently drift off its measurements. Currently only covered indirectly.
- **P2 — F9. Cross-calculator QA run.** Drive the calculators in `specs/qa.md`,
  compare canonical scenarios against the live site, triage disagreements
  against anchors, write `docs/qa/comparison-YYYY-MM-DD.md`.
- **P2 — F10. Adversarial oracle suite.** Extend
  `frontend/src/adversarial/oracle.test.ts` with one missing
  weird-combination/oracle case from external calculators, published anchors, or
  physical invariants. Incorrect-source failures stay red.

Rejected: animated inference simulations, live price feeds, benchmark scores,
accounts, iframe widget, raw architecture-field forms, exl2 tiers.

Distribution owner tasks live in `docs/LAUNCH_TODO.md`.

## Acceptance

Match the relevant spec, keep calculations in frontend TypeScript, avoid
LLM-only copy, cover behavior with challenging tests, pass `pnpm gate` unless a
QA oracle is intentionally red, and keep README/status/specs accurate.

## Blockers

- Required Claude deploy review cannot run: local `claude` says `Not logged in`.
- Owner has not deployed; production remains stale.
