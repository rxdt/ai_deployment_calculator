# Cross-Calculator QA — 2026-07-16

Method: Playwright read our public UI at `https://vram.rxdt.dev/` at run time,
then made one polite pass over the primary targets:
`https://apxml.com/tools/vram-calculator`, `https://vram.asmirnov.xyz/`, and
`https://huggingface.co/spaces/SadP0i/GGUF-Model-VRAM-Calculator`.

| Scenario | Our live total | External result | Triage |
| --- | ---: | ---: | --- |
| 7B fp16 inference, 8k context | 18.8 GB | asmirnov 28,937 MiB = 30.3 GB | Definitional: weights match (~14.0 GB), but asmirnov adds quadratic activations (10,672 MiB) and fp32 output tensor (3,914 MiB). No correction. |
| 70B fp16 inference, 8k context | 161.1 GB | asmirnov 159,741 MiB = 167.5 GB | Definitional: weights match (~140.0 GB); disagreement is activation/output scope vs our llama.cpp scratch + runtime buffer. No correction. |
| 70B Q4_K_M inference, 8k context | 53.8 GB | HF Space 43.31 “GB” = 46.5 decimal GB | Definitional: HF reports GiB-like model+context only, no runtime overhead/safety buffer. Its Q4_K_M model row 39.84 GiB = 42.8 GB aligns with our 42.4 GB weight row. No correction. |
| 8B QLoRA, 2% adapters | 21.0 GB | Unsupported by primaries reached | No comparison: asmirnov has no QLoRA/quantized adapter mode; HF target is GGUF inference-only. |
| 7B full training, AdamW, checkpointed | 152.9 GB | asmirnov 470,491 MiB = 493.3 GB | Definitional: asmirnov models uncheckpointed quadratic activations (341,500 MiB), fp32 output, and mixed resident params; not the checkpointed anchor. No correction. |
| SDXL 1024x1024 fp16 inference | 12.0 GB | Unsupported by primaries reached | No comparison: primary targets are LLM/transformer or GGUF-only calculators. |

Blocked primary: apxml rendered Cloudflare security verification in headless
Playwright (`Just a moment...`, Turnstile hidden input), so no numeric rows were
available without a human headed/browser pass.

Verdict: no Research Correction filed. External rows that overlap our formulas
support the resident weight math; remaining disagreements are scope/definition,
not evidence of an under-estimate.
