# Cross-Calculator QA — 2026-07-16

Method: Playwright read production `https://vram.rxdt.dev/`, then local
`main` via `pnpm build` + Vite preview, then made one polite pass over
`https://vram.asmirnov.xyz/`,
`https://sadp0i-gguf-model-vram-calculator.static.hf.space/`, and
`https://apxml.com/tools/vram-calculator`.

| Scenario                              | Production | Local `main` |                 External result | Triage                                                                                                                      |
| ------------------------------------- | ---------: | -----------: | ------------------------------: | --------------------------------------------------------------------------------------------------------------------------- |
| 7B fp16 inference, 8k context         |    18.8 GB |      18.8 GB |   asmirnov 28,937 MiB = 30.3 GB | Definitional: fp16 weights match; asmirnov adds quadratic activations and output tensor scope.                              |
| 70B fp16 inference, 8k context        |   161.1 GB |     161.1 GB | asmirnov 159,741 MiB = 167.5 GB | Definitional: fp16 weights match; disagreement is activation/output scope vs llama.cpp scratch + runtime buffer.            |
| 70B Q4_K_M inference, 8k context      |    53.8 GB |      53.8 GB |          HF 43.39 GiB = 46.6 GB | Definitional: HF reports GGUF model+context only; its 39.84 GiB model row = 42.8 GB, matching our 42.5 GB local weight row. |
| 8B QLoRA, 2% adapters                 |    21.0 GB |      21.1 GB |                     Unsupported | Production deploy drift: local upward rounding is correct; live under-reports by 0.1 GB. Owner-only redeploy required.      |
| 7B full training, AdamW, checkpointed |   152.9 GB |     152.9 GB | asmirnov 470,491 MiB = 493.3 GB | Definitional: asmirnov models uncheckpointed quadratic activations and mixed resident params, not checkpointed training.    |
| SDXL 1024x1024 fp16 inference         |    12.0 GB |      12.1 GB |                     Unsupported | Production deploy drift: local upward rounding is correct; live under-reports by 0.1 GB. Owner-only redeploy required.      |

Blocked primary: ApX rendered Cloudflare security verification in headless
Playwright (`Just a moment...`, empty Turnstile response), so no numeric rows
were available without a human headed/browser pass.

Verdict: no Research Correction against local `main`. External overlap supports
resident weight math; disagreements are scope/definition. Production is stale
for the latest upward-rounding bundle, so public deploy is NO-GO until the
owner redeploys local `main`.
