# AI Deployment VRAM Calculator Plan

## Goal

Build a GPU VRAM calculator that is usable for non-technical users and
trustworthy for engineers.

**P0 — VERACITY AND ACCURACY ABOVE ALL.** The numbers being CORRECT is this
app's entire value; a wrong estimate is worse than no app, because users make
hardware/spend decisions on it. Accuracy outranks features, polish, speed, and
deadlines — every time. Non-negotiables: numbers trace to the Research
Corrections math and published anchors, never to a competitor shortcut or a
convenient guess; any modeling assumption is stated in `Advanced assumptions`
so engineers can audit it; extremes stay finite/monotonic/non-NaN; when a value
cannot be defended against an anchor, say so rather than ship a confident wrong
number. Every formula-affecting change is validated per `specs/qa.md` (external
oracles) and cannot deploy without the two high-level reviews. If a change
trades correctness for anything, it does not ship.

The app must cover more than LLMs: text, embeddings, encoder-decoder, vision,
multimodal, image diffusion, video, audio, tabular, and custom workloads. Never
brand or describe it as LLM-only. Keep calculator formulas in frontend
TypeScript, keep the main UI short, put rare details in `Advanced assumptions`,
and show enough math in details that engineers can trust the recommendation.

## Workload Family Names

Use these values in UI, docs, labels, and tests:

```ts
text_generation | text_encoder | encoder_decoder | vision | vision_language
image_diffusion | video_generation | audio | tabular | custom
```

## Commands

- Loop preflight: `pnpm preflight`
- Full gate: `pnpm gate`
- QA contracts: `specs/qa.md`
- Frontend rules and current build/deploy gates: `specs/frontend.md`

## Spec Hygiene (every agent, every run)

Multiple agents share this repo. Full protocol in `PROMPT.md`; the essentials:

1. **Claim first.** Before editing, add `> CLAIMED BY <agent-id>: <tasks>` at
   the TOP of the one spec you take, and commit that claim before other work.
   Skip any spec that already carries another agent's claim line.
2. **Shrink to the truth.** When a contract/item is done, DELETE it from the
   spec — no struck `[x]`, no DONE notes; git history is the record. Carry
   forward only what the next agent needs; a one-line "shipped" goes in
   `docs/PROJECT_STATUS.md`, not the spec. A growing spec is a red flag.
3. **Release last.** Remove your claim line at run end — non-optional. A dead
   agent's stale claim (work committed / tree clean) may be reaped by the next.
4. KEEP GIT CLEAN. End your run with a committed, clean tree — no stray
   uncommitted/untracked files. On a clash, keep both sides' committed work
   (never discard another agent's), then leave the tree clean.

## Research Corrections

Non-negotiable math:

- Canonical equation: Required_GB = (Weights_GB + Working_Memory_GB +
  Training_State_GB + Runtime_Overhead_GB) * Buffer.
- KV cache is only for autoregressive/generative transformer workloads and must
  use architecture, sequence length, concurrency, and KV precision.
- Never use KV = Active_P / 10.
- Training VRAM is not a single P * 16 result.
- LoRA trains adapters, not all base weights.
- QLoRA uses a frozen 4-bit base plus adapter state, not a flat overhead.
- Diffusion/video memory is pipeline-specific and lower certainty by default.
- Known Model File Size overrides parameter-based weight estimates.
- MoE active parameters affect rough speed, not resident weight memory, unless
  expert offload/sharding is enabled.
- 2026-07-12: GQA=8 KV heads matches Llama-3-era models but underestimates
  MHA-era models; use real `num_key_value_heads` when known.
- 2026-07-12: generic 4-bit understates GGUF Q4_K_M (4.85 bpw); use real
  bits-per-weight and do not copy competitor shortcuts (GiB mislabeled as GB,
  MHA-only KV, flat training multipliers).
- 2026-07-15: inference activation scratch is fp16 compute buffer behavior, not
  quantized resident weight size. Keep 70B 4-8k context around the 1-3 GB
  measured-anchor envelope until architecture-keyed prefill math lands.

## Phase 2 Status

Shipped: F0 activation floor hotfix, F3 real quant ladder, F4 crawlable prose
and keyword flip, F4.1 guide relocation + FAQ removal.

Parked by owner directive (2026-07-16): F1, F2, F5, F6, F7, F8. Do not build.
Archived rationale: `scratchpad/DO-NOT-DO-phase2-features.md`.

Actionable recurring work:

- [ ] **F9. Cross-calculator QA run** (report-only). Drive the competitor
      calculators listed in `specs/qa.md`, compare canonical scenarios against
      the live site, triage disagreements against anchors, and write
      `docs/qa/comparison-YYYY-MM-DD.md`. Product-code changes become dated
      Research Corrections first.
- [ ] **F10. Adversarial oracle suite** (outside gate). Follow `specs/qa.md`
      Part B; write weird-combination/oracle cases from external calculators,
      published anchors, and physical invariants. Incorrect-source failures
      stay red as living bug reports.

Explicitly rejected: animated inference simulations, live multi-provider price
feeds, model-quality benchmark scores, accounts, embeddable iframe widget, raw
architecture-field forms, exl2 tiers.

## Distribution

Owner tasks live in `docs/LAUNCH_TODO.md`: custom domain, Show HN,
r/LocalLLaMA, r/StableDiffusion, HF/Kaggle replies, awesome-list PRs, README
positioning, GitHub topics.

## Acceptance Criteria

For any actionable feature or QA run:

1. Match the relevant spec contract.
2. Keep calculations in frontend TypeScript; no backend unless explicitly
   contracted.
3. Product copy must not imply LLM-only.
4. Tests cover behavior and challenge the source.
5. `pnpm gate` passes unless the QA contract explicitly allows red oracle tests.
6. README/status/specs stay accurate.

## Blockers

None open. Add symptom, attempts, and hypothesis here if a gate check fails 3x.
