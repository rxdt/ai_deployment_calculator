# AI Deployment VRAM Calculator Plan

**EXECMPT FROM 100 LINE MINIMUM** Keep less than 500 lines!

> ~~strikethrough~~ strikethrough completed items to clarify what is done

## Goal

Build a GPU VRAM calculator that is easy enough for non-technical users and trustworthy enough for engineers.

The app must:

1. Support more than LLMs.
2. Use frontend TypeScript as the calculation source of truth.
3. Keep calculator formulas in one frontend TypeScript source of truth.
4. Keep the main UI short.
5. Put rare details in `Advanced assumptions`.
6. Show enough math that engineers can trust the recommendation.

Do not pretend one equation covers all AI workloads.

## Naming Contract

Keep the old public names. Do not rename them to the addendum names.

Use these names in the UI, docs, labels, and tests:

```txt
Workload Family
Text generation / chat
Text embeddings / reranking / classification
Encoder-decoder generation
Vision understanding
Vision-language / multimodal
Image generation / diffusion
Video generation
Speech / audio
Tabular / classical ML
Custom / unknown
Known Model File Size
Total Model Parameters
Precision
Execution Mode
Runtime Profile
Advanced assumptions
```

Mapping from addendum/internal terms:

```txt
Model Family -> Workload Family
LLM / text generation -> Text generation / chat
Text encoder / embeddings / reranking / classification -> Text embeddings / reranking / classification
Known Resident Model Size -> Known Model File Size
```

Internal enum may stay concise:

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

## Implementation Specs

Use the focused specs for implementation work:

```txt
specs/frontend.md = frontend UI, TypeScript report building, output rendering, frontend tests.
specs/backend.md = Python report-service removal, backend-only test cleanup, backend docs cleanup.
```

The architectural target is Vite + frontend TypeScript calculations. No backend owns calculator formulas.

## Commands

Use `pnpm preflight` for the loop preflight and `pnpm gate` for the full gate.
Frontend-specific build, coverage, Playwright, Lighthouse, and preview commands
live in `specs/frontend.md`.

## Research Corrections

These are non-negotiable:

```txt
Required_GB = (Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB) * Buffer is the canonical equation.
KV cache is only for autoregressive/generative transformer workloads.
KV cache must use architecture, sequence length, concurrency, and KV precision.
Never use KV = Active_P / 10.
Training VRAM is not a single P * 16 result.
LoRA trains adapters, not all base weights.
QLoRA uses a frozen 4-bit base plus adapter state, not a flat 4 GB overhead.
Diffusion/video memory is pipeline-specific and lower confidence by default.
Known Model File Size should override parameter-based weight estimates for GGUF/exact files.
MoE active parameters affect rough speed, not resident weight memory, unless expert offload/sharding is enabled.
```

## Frontend Scope

Frontend-specific UI, output, warnings, TypeScript structure, and corrected frontend test expectations live in `specs/frontend.md`.

Use this file for the human grand vision, product goals, naming contract, and
research constraints. Keep implementation details in focused specs such as
`specs/frontend.md`.

Architecture bucket defaults, training defaults, and per-family working-memory
formulas are implementation detail and live in `specs/frontend.md`.

## Calculation Contract And Hardware

The canonical equation principles are in **Research Corrections** above. The full
implemented detail — per-family working-memory formulas, precision/runtime
presets, training/LoRA/QLoRA/full-training formulas, the MoE rule, the hardware
tier table, hardware-recommendation and fit math, and the speed estimate — lives
in `specs/frontend.md` and the source modules `frontend/src/calculator-core.ts`,
`workload-memory.ts`, and `hardware.ts`. Do not duplicate those formulas here.

## Documentation Scope

README should explain the product, supported workload families, estimate limitations, confidence modes, run/build/test commands, and known limitations.

Backend runtime cleanup details live in `specs/backend.md`. Frontend run/build/test details live in `specs/frontend.md`.

> ~~strikethrough~~ strikethrough completed items to clarify what is done

## Acceptance Criteria

Done means:

```txt
1. The calculator supports non-LLM workload families.
2. Workload Family is the first/main selector.
3. Context Window is not shown for all workloads.
4. KV cache is not visible globally.
5. KV cache is used only for generative transformer-style families.
6. Architecture/Dense dropdown is removed from main UI.
7. Training and LoRA are not separate checkboxes.
8. MoE is a checkbox only when relevant.
9. Active Parameters appears only when MoE is checked.
10. Active Parameters does not reduce resident weight memory by default.
11. Decoder KV uses architecture-based formula.
12. Encoder models do not use persistent generation KV.
13. Diffusion/video models do not show KV as the main memory concept.
14. Diffusion/video outputs show Rough or Estimated confidence.
15. GGUF can use a Known Model File Size override.
16. LoRA formula uses adapter states.
17. QLoRA formula uses quantized base + adapter states, not flat 4 GB.
18. Full training is not modeled as final Total_P * 16.
19. Full training includes weights, master weights, gradients, optimizer state, activations, overhead, and buffer.
20. Hardware recommendation comes from required_gb / utilization target.
21. Outputs show enough math to explain recommendations without overwhelming the user.
23. Speed estimate label adapts by workload.
25. Confidence label is always visible.
26. No old wrong formulas remain.
27. All calculations run in frontend TypeScript.
28. README is updated.
29. Unit tests pass.
30. Build passes.
31. E2E tests pass or exact blocker is documented.
```

> ~~strikethrough~~ strikethrough completed items to clarify what is done
