# Plan

> The human vision: what this project is and why. The loop reads this for direction; `specs/` carries out concrete, prioritized build plans.

## Goal

Use this doc to create detailed specs to get research and write well-planned out specs.

**PROHIBITED**
Do not edit anything in `harness/`.

**ALLOWED**
- Do Edit `/docs` and `/specs` and `src/`. Keep human updated on state of project in `PROJECT_STATUS`.

Create a highly specific set of numbers and create a ddeploymebt calculator using this dump of information:
- model GPU deployment calculator with all typical hardware options and use case toggles.

- Research how to calculate how many GPUs a deployment needs. Add findings to research and calculator.
     - What are the inputs?
     - What is the BASIC equation?
     - What cases change the calculation?
     - What are additional inputs?
     - What inputs do you need to collect from a user trying to calculate GPUs needed?
     - What else?

- Make the frontend SUPER SIMPLE. VERY BASIC.
- Frontend inspiration to copy from: `src/web/examples_sites` `/Users/rxdt/fitpick-ai/web`

## Calculator stuff

The GPU VRAM Master EquationTo accurately calculate your VRAM requirements, you must isolate the Model Weights (which shrink when quantized) from the KV Cache, Task Overhead, and CUDA Overhead (which generally do not shrink).The Formula$$VRAM_{GB} = W + KV + T + C$$1. Model Weights ($W$)The physical space the model takes up based on precision.$$W = P \times \frac{B}{8}$$$P$ = Parameters in Billions (e.g., 8 for Llama-3 8B)$B$ = Base Precision in Bits (16 for standard, 8 for int8, 4 for QLoRA)2. KV Cache / Context Window ($KV$)The memory required to remember the conversation history. This scales with the model size and context length, but remains in 16-bit precision even if the model is 4-bit.$$KV \approx \frac{P}{10} \times \frac{C}{8}$$$P$ = Parameters in Billions$C$ = Context Length in Thousands of Tokens (e.g., 8 for an 8k context)(Note: This is a highly accurate heuristic for modern architectures using Grouped Query Attention like Llama-3 and Mistral).3. Task Overhead ($T$)The extra memory required for gradients, optimizers, and adapters.Pure Inference (Running only): $T = 0\text{ GB}$QLoRA (4-bit Fine-Tuning): $T \approx 4\text{ GB}$ (For the 16-bit LoRA adapters and Adam optimizer states)Full 16-bit Training: $T \approx P \times 16\text{ GB}$4. CUDA / System Tax ($C$)The base memory required just to turn on the GPU and load the CUDA framework before doing any math.$$C \approx 1.5\text{ GB}$$Proving the Formula (Examples)Example 1: Llama-3 8B Standard Inference (16-bit, 8k context)$W$ (Weights): $8 \times (16/8) = 16\text{ GB}$$KV$ (Context): $(8/10) \times (8/8) = 0.8\text{ GB}$$T$ (Task): $0\text{ GB}$$C$ (CUDA): $1.5\text{ GB}$Total Allocated: $16 + 0.8 + 0 + 1.5 =$ 18.3 GB VRAMExample 2: Llama-3 8B QLoRA Fine-Tuning (4-bit, 8k context)$W$ (Weights): $8 \times (4/8) = 4\text{ GB}$ (Notice only this part shrank!)$KV$ (Context): $(8/10) \times (8/8) = 0.8\text{ GB}$$T$ (Task): $4\text{ GB}$$C$ (CUDA): $1.5\text{ GB}$Total Allocated: $4 + 0.8 + 4 + 1.5 =$ 10.3 GB VRAMExample 3: Llama-3 70B QLoRA Fine-Tuning (4-bit, 8k context)$W$ (Weights): $70 \times (4/8) = 35\text{ GB}$$KV$ (Context): $(70/10) \times (8/8) = 7\text{ GB}$$T$ (Task): $4\text{ GB}$$C$ (CUDA): $1.5\text{ GB}$Total Allocated: $35 + 7 + 4 + 1.5 =$ 47.5 GB VRAM

Spot on. You absolutely **cannot** just divide the final 16-bit memory requirement by 4.

You have correctly deduced the bottleneck: while the base model compresses beautifully, the operational "overhead" does not. Here is exactly why the math doesn't scale linearly, followed by how this impacts your inference speed.

### Why You Can't Just Divide by 4

When you drop from 16-bit to 4-bit precision, **only the static weights of the base model shrink.** Everything else happening on the GPU stubbornly refuses to get smaller:

1. **The KV Cache (Context Window):** When the model generates text, it has to remember the conversation history. This memory (the KV Cache) is almost always stored in 16-bit precision, even if the model weights are 4-bit. If you have a massive 8,000-token context window, that takes up gigabytes of 16-bit memory that cannot be compressed.
2. **The LoRA Adapters (During Training):** If you are using QLoRA, the frozen base model is 4-bit, but the new adapter weights you are actively training are kept in 16-bit or 32-bit. If they were 4-bit, they wouldn't have enough precision to actually learn anything new.
3. **Optimizer States & Gradients (During Training):** To train those adapters, the GPU has to calculate gradients and store optimizer states (like Adam). These mathematically require 32-bit precision to work correctly.
4. **CUDA Context (The Engine):** Just turning the GPU on and loading the CUDA toolkit reserves roughly 1 to 2 GB of VRAM before you even load a model.

Think of it like shrinking a massive video file from 4K to 480p. The file on your hard drive gets much smaller, but the video player application itself still takes up the exact same amount of RAM to run on your computer.

---

### Answering Your "Yes": How Quantization Affects Inference Speed

Since you are moving a model that is 4x smaller, you might logically assume a 4-bit model generates text 4x faster than a 16-bit model.

Counter-intuitively, **it is rarely that much faster, and on high-end hardware, it can actually be slower.** Here is the breakdown of why.

#### The "Memory Bandwidth" vs. "Compute" Tug-of-War

LLM text generation is almost entirely **memory-bandwidth bound**. The GPU cores are incredibly fast, but they spend most of their time sitting idle waiting for the massive model weights to be pulled from the VRAM into the processor to calculate the next word.

Because a 4-bit model is physically smaller, it requires less data to travel across the memory bus. This is a massive win for speed.

#### The De-Quantization Tax

However, there is a catch: **GPUs cannot natively do math in 4-bit.** When the GPU pulls a 4-bit weight from memory, it has to instantly **de-quantize** it back into 16-bit precision, do the math to predict the next word, and then throw it away. This on-the-fly conversion requires extra compute power.

#### How this plays out on your hardware:

* **On Consumer Hardware (RTX 3090, 4090, or MacBooks):** You will see a noticeably faster inference speed with 4-bit models. Consumer hardware has relatively slow memory bandwidth, so sending smaller 4-bit files across the bus saves so much time that it completely eclipses the tiny "de-quantization tax."
* **On Enterprise Hardware (Nvidia A100 or H100):** You might actually see a *drop* in tokens per second with 4-bit models. Enterprise GPUs have astronomically fast memory bandwidth (up to 3.2 TB/s). They can pull a massive 16-bit model into the processor almost instantly. On these machines, the memory transfer is so fast that the extra compute time required to de-quantize the 4-bit weights actually becomes the new bottleneck, slowing the whole system down.

Example incomplete basic calculator (probably contains incorrect assumptions):

    """Estimate the VRAM (GB, safety margin applied) a model needs to serve.

    VRAM = weights + KV cache + task overhead + CUDA/system tax, then a 10%
    safety margin. Weights shrink with weight quantization; the KV cache shrinks
    ONLY with KV-cache quantization (``kv_cache_bits`` < 16, e.g. fp8_kv), never
    with weight quantization -- at long context the 16-bit KV cache can exceed
    the quantized weights and decide how many GPUs are needed.

    ``weight_bits`` overrides the precision implied by model metadata (e.g. to
    cost a hypothetical fp8 build); ``kv_cache_bits`` selects the KV precision
    (16 default, 8 for fp8_kv, 4 for fp4_kv). Returns e.g. ``20.1`` for an 8B
    bf16 model at an 8k context window. Models with no known parameter count
    fall back to the constant tax terms only.
    """
    parameters = getattr(model, "parameters", None)
    billions = (
        parameters / 1_000_000_000
        if isinstance(parameters, (int, float)) and parameters > 0
        else 0.0
    )
    thousands = (getattr(model, "context_window", None) or DEFAULT_CONTEXT_WINDOW) / 1_000
    bits = (
        weight_bits
        if weight_bits is not None
        else _precision_bits(getattr(model, "precision", []))
    )
    weights = billions * (bits / 8)
    kv_cache = (billions / 10) * (thousands / 8) * (kv_cache_bits / 16)
    total = weights + kv_cache + task_overhead_gb + VRAM_CUDA_SYSTEM_TAX_GB
    return round(total * VRAM_SAFETY_MARGIN, 1)


    """Estimate the VRAM (GB, safety margin applied) a model needs to serve.

    VRAM = weights + KV cache + task overhead + CUDA/system tax, then a 10%
    safety margin. Weights shrink with weight quantization; the KV cache shrinks
    ONLY with KV-cache quantization (``kv_cache_bits`` < 16, e.g. fp8_kv), never
    with weight quantization -- at long context the 16-bit KV cache can exceed
    the quantized weights and decide how many GPUs are needed.

    ``weight_bits`` overrides the precision implied by model metadata (e.g. to
    cost a hypothetical fp8 build); ``kv_cache_bits`` selects the KV precision
    (16 default, 8 for fp8_kv, 4 for fp4_kv). Returns e.g. ``20.1`` for an 8B
    bf16 model at an 8k context window. Models with no known parameter count
    fall back to the constant tax terms only.
    """
    parameters = getattr(model, "parameters", None)
    billions = (
        parameters / 1_000_000_000
        if isinstance(parameters, (int, float)) and parameters > 0
        else 0.0
    )
    thousands = (getattr(model, "context_window", None) or DEFAULT_CONTEXT_WINDOW) / 1_000
    bits = (
        weight_bits
        if weight_bits is not None
        else _precision_bits(getattr(model, "precision", []))
    )
    weights = billions * (bits / 8)
    kv_cache = (billions / 10) * (thousands / 8) * (kv_cache_bits / 16)
    total = weights + kv_cache + task_overhead_gb + VRAM_CUDA_SYSTEM_TAX_GB
    return round(total * VRAM_SAFETY_MARGIN, 1)

Training models require even more hardware.

KV cache is not variable unless what?

## Approach

1) Make no assumptions
2) research extensively
3) Creatae a reliavle doc in docs to add your research and structure the research in a way you can understand - json is fine or whaever

- Deterministic, well-typed packages MINIMAL under `src/`. Probably only ONE pydantic class needed.
- Wquations are modular functions
- Built by the gated Ralph loop, one small change per iteration, 100% covered from day one.
- Create a super lightweight very basic web app that taskes input:
    hceckbox: model is trained
    model is quantiezed: with dropdown of options
    input or drop down of randges of model parameters
    input or drop down of randges of model contex_window
    secondary adaptor will be used?
    ...what else?..??
- once you hall research for first pass, sket out a plan. Scope out tasks in @specs directory. Update docs if needed. IF your context window is at or equal to 40%, stop. Otherwise continue researching and updating docs and specs.
- whern does CPU gert paried with GPU?

- Do not assume any ONE source is correct. Cross reference everything. Approac like a datasicentist.

- Oncce formula is set you can return what hardware is recommended and with what optimizations. Whill users need tensor praallelization for example?

- None of this is speicic. These are real equations we eneed to find which generalize to all models. AI engineers rarely know what hardware or opimitzations to set for models. This solves that problem and keeps infra engineers from having to hand write calculations for every single deployment.

- What have you not icondsiered?

Te frontend will be one page, no scrolling. You decide what inputs are needed from a user. The frontend example lives at `/Users/rxdt/fitpick-ai/web` - you do not have to review the code. AND our oalculator will be MUCH simpler. Juss steal styling components and framewoks and themes from that app to make life easier.

- Since users will have to input all info, this should a straighforward calculation.

- Update research docs and README for next agent to take over.

- Another agent will be on the project with you. So plit the work evently and do NOT step on each others work. Organize yourselves. Lay claim to tighly scoped tasks you can complete in <30 miunts and 100K context window. Monitor yourselves carefully.

- These are the frontend lint files to copy over into `web/` from the other `app` which has NOTHING to do with this app
`web/eslint.config.js`
`web/stylelint.config.js`
You will have to follow these lint rules structily while adding the frontend

## Milestones

1. Equation with ALL inputs is olidified:
    VRAM
    KV / Attention Mechanism
    Safety overhead multiplier
    Quantization effects
    How secondary adaptors
    Training overhead
    How context window affecrts model equatin outputs
    ...what else?..??
2. Toggles/checkboxes in frontend and wired to backend calculations for:
- model will be used for training
- quantized model drop down (fp4, int4, fp8,, fp16, etc.)
- parameter size of model
3. Frontend successully takes in all expected inputs and correctly outputs GPUs needed.

# GOAL; Launch NOW


# COMPLETION CRITERIA:
- `uv run ralph verify` passes. All changes on Github.
- End to end one page no scroll app is functional and bug free
- Calculations entered into frontend produce correct results
