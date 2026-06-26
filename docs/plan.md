# Plan

> Launch handoff. Agents should work only the open launch path below.

## Goal

Launch the Vite AI deployment calculator with a Python API backend. The calculator is reliable enough to be a real calculator.

## User requested changes. Put these in more exact wording in specs:
- Clean up this document of items already contained in specs. This is written in messy human language. Optimize language for AI agents to understand and NOT miss any details.
- Clean up the README.md to only contain useful information to a human user

Ensure the app is following these 4 rules:

1. SEMANTIC HTML & A11Y FIRST
- Do not use generic <div> or <span> elements for interactive components. Use <button>, <main>, <nav>, <header>, <section>, and <article>.
- Every interactive element must be fully focusable and usable via Keyboard alone (Tab, Enter, Space).
- Ensure all forms use explicit <label> tags bound to inputs via `htmlFor` / `id`.
- Use descriptive text for buttons and links. Avoid "Click Here" or "Read More".
- Never rely solely on color to convey meaning (e.g., error states must include text, not just a red border).

1. PLAYWRIGHT-READY LOCATORS
- Write code that can be easily targeted by Playwright's user-centric locators.
- Prefer explicit ARIA roles and labels (e.g., use `aria-label="Close menu"` on icon-only buttons).
- If a component has complex UI states, use standard `aria-expanded`, `aria-checked`, or `aria-selected` attributes so tests can instantly validate the state.

1. RESILIENT HYDRATION & STATE
- Ensure all asynchronous data fetching handles Loading, Error, and Empty states gracefully.
- Disable form submission buttons while an API request is pending to prevent duplicate submissions.

1. VITE & PERFORMANCE METRICS
- Keep components modular and optimized for Vite's bundling.
- Avoid heavy layout shifts. Images must have explicit `width` and `height` properties or aspect-ratio boxes to prevent Cumulative Layout Shift (CLS).

- Implement visual regression and mobile responsiveness checks for our Vite calculator app using Playwright:
1. Update the Playwright test file to include a visual layout snapshot assertion at the end of the test workflow:
   await expect(page).toHaveScreenshot('calculator-layout.png');
2. Run the following command in the terminal to generate the initial, pixel-perfect baseline images across all configured browsers and viewports:
   npx playwright test --update-snapshots
3. Run the mobile-specific test suite to ensure the layout, button sizes, and grid alignment adapt correctly to smaller screens without clipping:
   npx playwright test --project="VRAM-Calculator" --project="Mobile Safari"
4. Finally, run the production compiler to verify there are no hidden asset bundling issues, TypeScript errors, or build warnings:
   npm run build

UX/UI

- The entire calculator should be visible on one screen, no scrolling. Right now everything below "Active parameters (billions)" is not visible without scrolling down. It should also not be shrunken. Right now it has been reduced some amount so there is a large gap below any text or outputs.
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
- And add 2 missing outputs
1. Tokens Per Second (TPS) Estimation:
  - Logic: Roughly Memory_Bandwidth (GB/s) / Model_Size (GB).
  - Why add this? DevOps engineers care about throughput. If a model fits on a Mac but generates 0.5 tokens/sec, they can't use it for a chatbot.
2. Cost Estimates (for Cloud):
  - Logic: Take the estimated GPU count and multiply by current cloud hourly rates (e.g., $2.00/hr for an A100).
   - Why add this? DevOps engineers usually have to justify their budget.

- for the fits-on-hardware messaging you can do simple messaging like:
if (TotalGB <= 8): "Fits easily on budget consumer GPUs (e.g., RTX 4060) or any M-series Mac."
else if (TotalGB <= 12): "Fits on mid-range consumer GPUs (e.g., RTX 3060, 4070) or a 16GB Mac."
else if (TotalGB <= 24): "Fits perfectly on 1x high-end consumer GPU (RTX 3090 / 4090) or a 32GB Mac."
else if (TotalGB <= 48): "Requires 2x RTX 3090/4090s, 1x RTX A6000, or a 64GB Mac Studio."
else if (TotalGB <= 80): "Requires 1x Enterprise A100/H100 (80GB), 4x RTX 4090s, or a 128GB Mac Studio."
else: "Requires a multi-GPU Enterprise Cluster (e.g., 2x A100s, 8x RTX 4090s)."

- Address issues from this report: file:///Users/rxdt/ai_deployment_calculator/127.0.0.1_2026-06-26_03-17-43.report.html

- Add disclaimer at bottom like 'Estimates use standard heuristics and rules-of-thumb. Real usage varies with framework (vLLM, etc.), optimizations, and exact model architecture.'

- The "Slow Mode" Warning (For Edge/Local). Add this logic: If Total_Memory > GPU_VRAM_Capacity, display a warning: "⚠️ Warning: Memory exceeds GPU capacity. Backend will offload to System RAM, which will significantly reduce generation speed."

To be very specific, AI Model Hardware Calculator: UI/UX Specification.
The Core FormulaTotal_Memory = (W + KV_Scaled + T + C) * Buffer2. The Inputs (User Interface)Group 1: Model SpecsTotal Parameters:UI: Number Field + Unit Dropdown (Billions (B) [Default], Millions (M), Thousands (K)).Logic: Convert to Billions for math (P).Mixture of Experts (MoE):UI: Toggle switch.Logic: If ON, reveal Active Parameters input. If OFF, Active_P = Total_P.Group 2: Quantization & PrecisionWeight Precision: Dropdown (32-bit (fp32), 16-bit (fp16/bf16) [Default], 8-bit (int8), 4-bit (GGUF/QLoRA)).KV Cache Precision: Dropdown (16-bit Standard [Default], 8-bit (fp8)).Group 3: Context & WorkloadContext Window: Number input (Tokens). Default: 8000.Batch Size: Number input. Default: 1.Group 4: Environment & TaskBackend: Dropdown (Production Server -> Buffer 1.10, Tax 1.5GB | Local -> Buffer 1.0, Tax 0.5GB).Task Type: Dropdown (Inference, LoRA, QLoRA, Full Training).3. The Math Engine (Behind the Scenes)Weights ($W$): Total_P * (Weight_Bits / 8)Base KV Cache: (Active_P / 10) * (Context_Window / 8000) * (KV_Bits / 16)Scaled KV Cache ($KV_{Scaled}$): Base_KV * Batch_SizeNote: Batch size only scales the KV Cache, not the weights or overhead.Task Overhead ($T$):Inference = 0LoRA = (Total_P * 0.02) * 8QLoRA = 4 (Flat GB)Full Training = Total_P * 16Framework Tax ($C$): Based on Backend.Final Calculation: Total_Memory = (W + KV_Scaled + T + C) * Buffer4. The Outputs (Display to User)A. The HeadlineValue: [Total_Memory] GBB. The Breakdown (Transparency)Weights: [W] GBKV Cache (Total for all batches): [KV_Scaled] GBDisplay helper: "Calculated as [Base_KV] GB x [Batch_Size] batches."Task Overhead: [T] GBFramework Tax: [C] GBSafety Buffer: [Safety Buffer] GB (Hide row if Local/Edge backend selected).
<= 8 GB: Entry-level (e.g., RTX 4060, 16GB RAM)
<= 12 GB: Mid-range consumer (e.g., RTX 4070)
<= 24 GB: High-end desktop (e.g., RTX 3090/4090)
<= 48 GB: Pro workstation (e.g., 2x 3090s or 1x A6000)
<= 80 GB: Enterprise server (e.g., 1x A100/H100)
<= 160 GB: High-performance cluster (e.g., 2x A100s)
<= 320 GB: Enterprise cluster (e.g., 4x A100s)
> 320 GB: Distributed multi-node cluster


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

- Use `frontend/example_user_will_delete/` as a styling and javascript example to borrow from.
- Do not preserve WSGI for compatibility; remove it ASAP and get things working with FastAPI.

## Required Checks

```sh
cd frontend && npm run build
cd frontend && npm run test:e2e
harness preflight
harness gate
```

If Playwright still fails outside the sandbox, record the exact command and
error in `docs/PROJECT_STATUS.md`.
