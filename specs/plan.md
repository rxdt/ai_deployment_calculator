# AI Deployment VRAM Calculator Plan

> ~~strikethrough~~ strikethrough completed items to clarify what is done

## Goal

Build a GPU VRAM calculator that is easy enough for non-technical users and trustworthy enough for engineers.

The app must:

1. Support more than GPUs for LLMs
2. Use frontend TypeScript as the calculation source of truth.
3. Keep calculator formulas in one frontend TypeScript source of truth.
4. Keep the main UI short.
5. Put rare details in `Advanced assumptions`.
6. Show enough math in collapsed details that engineers can trust the recommendation.

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
live in `specs/frontend.md`.

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

> ~~strikethrough~~ strikethrough completed items to clarify what is done

## Acceptance Criteria

Done means:

1. The calculator supports non-LLM workload families.
2. Model Family is the first/main selector.
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
14. GGUF can use a Known Model File Size override.
15. LoRA formula uses adapter states.
16. QLoRA formula uses quantized base + adapter states, not flat 4 GB.
17. Full training is not modeled as final Total_P \* 16.
18. Full training includes weights, master weights, gradients, optimizer state, activations, overhead, and buffer.
19. Hardware recommendation comes from required_gb / utilization target.
20. Outputs show enough math to explain recommendations without overwhelming the user.
21. Correct formulas remain.
22. All calculations run in frontend TypeScript.
23. README is updated.
24. Unit tests pass.
25. Build passes.
26. Gate passes

> ~~strikethrough~~ strikethrough completed items to clarify what is done
