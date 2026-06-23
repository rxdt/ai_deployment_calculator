# Plan

> Human vision and durable project context. `specs/` is the executable build
> plan; this file keeps the research summary short enough to hand off.

## Goal

Build a deterministic AI deployment calculator that helps engineers estimate GPU
VRAM, host RAM, hardware fit, and the most useful memory optimization without
hand-calculating every model deployment.

## Boundaries

- Do not edit `harness/` or `tests/harness/`.
- Work in `src/`, `tests/`, `specs/`, `docs/`, `README.md`, and `PROMPT.md`.
- Keep each change scoped to one spec-backed gap.
- Keep every markdown file under 100 lines.

## Core Equation

`VRAM_GB = (W + KV + T + C) * 1.10`, rounded to one decimal.

- `W = parameters_b * (weight_bits / 8)`.
- `KV = (parameters_b / 10) * (context_tokens / 1000 / 8) * (kv_cache_bits / 16)`.
- `T = 0` for inference, `4 GB` for QLoRA, and `parameters_b * 16` for full training.
- `C = 1.5 GB` CUDA/system tax.
- Weight and KV precision support: 32-bit, 16-bit, 8-bit, and 4-bit.
- Host RAM floor: at least 32 GB, rounded up in 16 GB increments from total VRAM.

Worked checks:

- 8B, 16-bit weights, 16-bit KV, 8k inference: `20.1 GB`.
- 8B, 4-bit weights, 16-bit KV, 8k QLoRA: `11.3 GB`.
- 70B, 4-bit weights, 16-bit KV, 8k QLoRA: `52.3 GB`.
- 400,000 parameters is `0.0004` billion; with 8-bit weights, 8-bit KV,
  8k context, and full training, total VRAM rounds to `1.7 GB`.

## Research Notes

- Open question: does a model ever need specific CPU selection with its deployment?
- Open question: should hardware memory bandwidth influence recommendations later?
- Quantizing model weights does not quantize KV cache, CUDA overhead, gradients,
  optimizers, or adapter memory.
- Long-context deployments can become KV-cache bound even when weights are 4-bit.
- QLoRA keeps the base model small but still needs adapter and optimizer memory.
- Full training is intentionally coarse here; this calculator is for first-pass
  deployment sizing, not throughput or training-performance prediction.
- Hardware recommendations are fit estimates, not live availability or price data.
- Open question: How should we model non-Pytorch use cases in our frontend? How should we adjust the caclulations? Do we create a separate equation?
- Open question: How does non-Pytorch affect GPU needs?
`When you step outside standard Hugging Face/PyTorch pipelines and use optimized inference engines (like llama.cpp, vLLM, or MLX), the memory math changes drastically.These frameworks are specifically built to bypass PyTorch's memory fragmentation and heavy runtime overhead. Here is how your formula changes depending on the backend you use:1. llama.cpp (GGUF format) — The Bare-Metal Championllama.cpp is written in pure C/C++ and is designed to squeeze every drop of efficiency out of local hardware.No PyTorch Buffer: You can completely remove the * 1.10 buffer from your formula. llama.cpp maps memory exactly as it needs it without PyTorch's dynamic workspace bloat.Tiny CUDA Tax: The base framework tax (C) drops from 1.5 GB down to a few hundred megabytes (or zero if running purely on CPU).Partial Offloading: llama.cpp doesn't require the whole model to fit in VRAM. If your formula outputs 20 GB but you only have a 12 GB GPU, llama.cpp lets you load exactly 11.5 GB of weights/KV into the GPU and spills the rest to your system RAM.2. vLLM — The Production Workhorse (PagedAttention)While vLLM is tightly integrated with the PyTorch ecosystem, it completely hijacks PyTorch's default memory manager to use a concept called PagedAttention (inspired by OS virtual memory).The "Pre-Allocate Everything" Rule: In vLLM, you don't calculate the KV cache—you calculate the weights, and vLLM automatically consumes the rest of your GPU.By default, vLLM reserves 90% of your total GPU VRAM on startup (gpu_memory_utilization=0.90). It loads the weights ($W$) and the CUDA graphs into that space, and then formats every single remaining gigabyte into a massive, fragmented-proof KV Cache pool.Zero Waste: Standard PyTorch wastes 60-80% of KV cache memory due to fragmentation when users send variable-length prompts. PagedAttention cuts that waste down to under 4%, allowing you to serve drastically larger batch sizes on the same hardware.3. Apple MLX — Unified MemoryIf you are running on Apple Silicon (M-series Macs), the concept of separate System RAM and GPU VRAM disappears.Zero Transfer Tax: You don't need the System RAM = VRAM * 1.5 safety rule anymore. Because the CPU and GPU share the exact same pool of physical memory, the model is loaded directly into RAM once, and the GPU can instantly compute against it without copying data across a PCIe bus.In short: If you want to run a model that just barely doesn't fit in your PyTorch calculation, converting it to GGUF and running it through llama.cpp will almost always make it fit.Check out this guide on running large models on low VRAM with llama.cpp to see how heavily optimized non-PyTorch frameworks can stretch limited hardware.`

## Product Shape

- Pure typed Python core under `src/`.
- One pydantic input model: `DeploymentSpec`.
- Dataclasses for comparison, assumptions, hardware, plans, and reports.
- One-page GET-submitting web UI with no required JavaScript.
- Inputs: parameters, context window, task/training mode, weight precision,
  KV-cache precision, and adapter usage.
- Outputs: VRAM total and breakdown, host RAM, hardware table, primary plan,
  quantization comparison, and assumptions.

## Current Milestones

- Priority 1: VRAM formula and validated input model are implemented.
- Priority 2: hardware fit and host RAM recommendation are implemented.
- Priority 3: one-page web UI and quantization comparison are implemented.
- Priority 4: deployment plan and assumption transparency are implemented.

## Run often

- `ruff check . && ruff format --check . && pytest` passes with 100% coverage.
- `pyright` passes.
- `semgrep scan --config auto --config p/secrets --error` passes.

## Completion Criteria

- `uv run ralph gate` passes before commit
- `uv run ralph verify` passes before push.
- Specs, README, and project status match the code.
