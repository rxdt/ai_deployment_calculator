# Plan

> Launch handoff. Agents should work only the open launch path below.

## Goal

Launch the Vite AI deployment calculator with a Python API backend. The calculator is reliable enough to be a real calculator.

## User requested changes. Put these in more exact wording in specs:
- Clean up this document of items already contained in specs
- Clean up the README.md to only contain useful information to a human user

UX/UI

- The entire calculator should be visible on one screen, no scrolling. Right now everything below "Active parameters (billions)" is not visible without scrolling down.
- "Parameters (billions)" in calculator portion was confusing. Asking a user to type 0.0003 for a 300k parameter model is terrible UX. The best practice here is a Compound Input: A standard number input field sitting right next to a
"Unit" dropdown. The Input: [ 300 ]
The Dropdown: [ Billions | Millions | Thousands ]
The Under-the-hood Math: If the user selects Millions, simply divide their input by $1,000$ before running your master equation. If they select Thousands (K), divide by $1,000,000$. I have added this logic to the design spec.
- Research which architectures we need to add besides "MoE" and "Dense". Training perhaps? Find out. Assume nothing.
- Replace "Dense" with "Dense (Typical inference)"
- Clarify when a suser will need to enter "Active parameters (billions)"? Is it only with MoE models? Research and verify. NO assumptions or false information.
- Remove message "Lower weight precision (8-bit or 4-bit) to shrink the model weights first." No one is asking for advice. The calculator should only calculate.
- Explain in next spec why "Primary: RTX 4090 (single GPU)" is showing for "20.1 GB"?
- Clarify in the calculator box "KV cache" with the 4 dropdowns -- does "KV cache" mean the KV cache can be different bits 4-32? Research if/when that actually happens in the real world. What are real world values?
- The wording and mental model is not "Model is trained". The mental model is, if GPUs are needed for a model to be trained, then more GPUs are needed. Change workding to "GPUs are for model training". Search the repo for false statements or assumptions that reflect the mental model "Model is trained" instead of GPUs will be used for training.

- Note: (PyTorch / vLLM / SGLang / TensorRT): These engines optimize for speed and concurrency by pre-allocating massive blocks of VRAM, suffering from memory fragmentation, and requiring larger CUDA graphs. They use the 1.10x multiplier and the 1.5 GB CUDA tax.
- Note: The "Local/Edge" Paradigm (llama.cpp / MLX / Ollama): These engines use strict C/C++ memory mapping. They allocate exactly what they need, zero fragmentation, and can spill into system RAM. They use the 1.0x multiplier and a tiny 0.5 GB CUDA tax.

- Does this section show calculations? If so, you should have a small stylized banner in the section that says "Results":
"Weights
3.0 GB

KV cache
0.4 GB

Task
4.0 GB

CUDA/system
1.5 GB"
Clarify wording in the frontend if you already have above that "16.0 GB weights, 0.8 GB KV, 32 GB host RAM":
    - What is "CUDA/system
    1.5 GB" supposed to mean?
    - What does "Task
    0.0 GB" mean? Task selection should be an optino in the calculator with e.g. Inference, Training. And what else?
    - What does "KV cache
    0.8 GB"
    - What does "Weights
    16.0 GB" mean?


- The table of "Hardware GPU	Cards	Mode" with "T4 16GB" to "B200 192GB" is not helpful. What would be helpful is a table that shows what hardware the computed VRAM would fit on. So if 20.1 is calculated, you should show what? Maybe
"Fits on:"
"Hardware
GPU	Cards	Mode"
"T4 16GB 2x 16 GB	tensor parallel"
"RTX 4090	1x 24 GB	single GPU"

- Inputs should be:
"Total Model Parameters" Integer input with
- "MoE Model?" (Toggle or checkbox). If checked, reveal a second input for Active Parameters. If unchecked, Active Parameters = Total Parameters in calculations.
- Quantization & Precision
    - "Weight Precision" Dropdown (32-bit fp32, 16-bit fp16/bf16, 8-bit int8, 4-bit/GGUF/QLoRA)
    - "KV Cache Precision" Dropdown (16-bit Standard, 8-bit fp8)
- Usage & Workload
    - "Context Window" Integer input (Tokens, e.g., 8000, 32000, 1000000).
- "Task Type" Dropdown (Inference, LoRA, QLoRA, Full Training). Sets Task overhead ($T$) to 0, adapter formula, adapter formula, or 16x multiplier.

- The Outputs (What to Display)
    - The Headline Number (what you have preset as "20.1 GB") with a stylized label "Total Required Memory"
    - The Math Breakdown (for ransparency)
        - Model Weights ($W$): X GB
        - Context / KV Cache ($KV$): X GB
        - Task Overhead ($T$): X GB
        - Framework Tax ($C$): X GB
        - Safety Buffer: X GB (Only show if PyTorch is selected)
- Note: Why only show the "Safety Buffer" if PyTorch is selected? Because of how PyTorch handles memory versus C++ engines. PyTorch dynamically allocates memory on the fly. As it creates and destroys tensors, the VRAM gets fragmented (like Swiss cheese), so you need a 10% safety buffer (* 1.10) to prevent the GPU from panicking and crashing. llama.cpp and GGUF files use memory-mapping (mmap). It looks at the file, calculates the exact byte size, and carves out exactly that much space. 10 GB calculated is exactly 10.0 GB used. No buffer required.

- for the fits-on-hardware messaging you can do simple messaging like:
if (TotalGB <= 8): "Fits easily on budget consumer GPUs (e.g., RTX 4060) or any M-series Mac."
else if (TotalGB <= 12): "Fits on mid-range consumer GPUs (e.g., RTX 3060, 4070) or a 16GB Mac."
else if (TotalGB <= 24): "Fits perfectly on 1x high-end consumer GPU (RTX 3090 / 4090) or a 32GB Mac."
else if (TotalGB <= 48): "Requires 2x RTX 3090/4090s, 1x RTX A6000, or a 64GB Mac Studio."
else if (TotalGB <= 80): "Requires 1x Enterprise A100/H100 (80GB), 4x RTX 4090s, or a 128GB Mac Studio."
else: "Requires a multi-GPU Enterprise Cluster (e.g., 2x A100s, 8x RTX 4090s)."

- Address issues from this report: file:///Users/rxdt/ai_deployment_calculator/127.0.0.1_2026-06-26_03-17-43.report.html

- Add disclaimer at bottom like 'Estimates use standard heuristics and rules-of-thumb. Real usage varies with framework (vLLM, etc.), optimizations, and exact model architecture.'

## Plus: Remaining Work

1. Add no new files.
2. Condense files we have now if there is sprawl and functionality that could be grouped.
3. Serve the built Vite app from FastAPI when `frontend/dist` exists.
4. Keep `/api/report` working from FastAPI.
5. Remove the WSGI entrypoint and its tests if it still exists. The app should
   have one backend launch path: FastAPI.
6. Keep the static fallback page only if it is still needed as a no-build
   FastAPI fallback; do not keep a second WSGI server for it.
7. Run one real browser smoke against the real API. If the agent sandbox blocks
   localhost or Chromium, rerun the same command unsandboxed.
8. Update README and `docs/PROJECT_STATUS.md` with the truthful launch command, checks run, and blockers.


## Active Spec

- Work from `specs/frontend.md`.
- It is the only remaining spec. Finished specs have been removed so agents do
  not keep selecting stale work.

## Do Not Do

- Do not add more calculator math, hardware catalog, parser edge cases, or
  mocked Playwright tests.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
- Do not preserve WSGI for compatibility; remove it once FastAPI covers launch.

## Required Checks

```sh
cd frontend && npm run build
cd frontend && npm run test:e2e
harness preflight
harness gate
```

If Playwright still fails outside the sandbox, record the exact command and
error in `docs/PROJECT_STATUS.md`.
