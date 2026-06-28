# AI Deployment VRAM Calculator Plan

**EXECMPT FROM 100 LINE MINIMUM** Keep less than 500 lines!

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
Compare with my GPU
Total Resident Parameters
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
Compare With My GPU -> Compare with my GPU
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
Cloud prices are static estimates unless live pricing is actually fetched.
```

## Frontend Scope

Frontend-specific UI, output, warnings, TypeScript structure, and corrected frontend test expectations live in `specs/frontend.md`.

Use `docs/plan.md` for the broader architecture and calculation contract. Use `specs/frontend.md` for headless frontend implementation work.

Transformer architecture bucket defaults:

```txt
<= 1B:   layers 16, hidden 2048, heads 32, kv_heads 8, head_dim 64
<= 4B:   layers 28, hidden 3072, heads 24, kv_heads 8, head_dim 128
<= 10B:  layers 32, hidden 4096, heads 32, kv_heads 8, head_dim 128
<= 20B:  layers 40, hidden 5120, heads 40, kv_heads 8, head_dim 128
<= 40B:  layers 48, hidden 6144, heads 48, kv_heads 8, head_dim 128
<= 80B:  layers 80, hidden 8192, heads 64, kv_heads 8, head_dim 128
<= 160B: layers 96, hidden 10240, heads 80, kv_heads 8, head_dim 128
> 160B:  layers 120, hidden 12288, heads 96, kv_heads 8, head_dim 128
```

Also compute `conservative_kv_heads = attention_heads` and show it in advanced output.

Training defaults:

```txt
AdamW optimizer_bytes = 8
8-bit Adam optimizer_bytes = 2
SGD-like optimizer_bytes = 4
gradient_bytes = 2
activation_bytes = 2
master_weight_bytes = 4
adapter_weight_bytes = 2
gradient_checkpointing checked -> activation_factor_training = 3
gradient_checkpointing unchecked -> activation_factor_training = 8
lora_trainable_percent options = 0.1%, 0.5%, 1%, 2%
```

## Calculation Contract

Keep internal values unrounded. Display GB values rounded to one decimal.

The canonical base equation is:

```txt
Required_GB = (Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB) * Buffer
```

Everything else is a component plugged into that equation.

The old display shorthand can still be used only if the pieces are renamed:

```txt
Total_Memory = (W + KV + T + C) * Buffer

W = Weights_GB
KV = decoder/generative KV cache only, otherwise 0
T = Training_State_GB + Training_Activation_GB
C = Runtime_Overhead_GB
```

### Universal

```txt
Total_Params_B = total_params_value * unit_multiplier
Resident_Params_B = Total_Params_B unless expert_offload_enabled or component params override it
Active_Params_B = active_params_input_b if moe_enabled else Total_Params_B
Weights_GB = Known_Model_File_Size_GB * GPU_Resident_Fraction if Known_Model_File_Size_GB is provided else Resident_Params_B * Weight_Bytes * Weight_Overhead
Subtotal_GB = Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB
Safety_Buffer_GB = Subtotal_GB * (Buffer - 1)
Required_GB = Subtotal_GB * Buffer
```

Code may use lower-case variable names, but reports and docs should use the component names above.

### Text Generation / Chat

```txt
kv_gb = concurrent_requests * context_tokens * 2 * num_layers * kv_heads * head_dim * kv_bytes / 1e9
decoder_scratch_gb = weights_gb * decoder_scratch_ratio
decoder_scratch_ratio = 0.03 for Local / Edge, 0.05 for Server / Cloud
working_memory_gb = kv_gb + decoder_scratch_gb
```

The `2` is key + value.

For deterministic tests, set `decoder_scratch_gb = 0`. If production keeps decoder scratch, compute expected values from the same configured scratch value and do not mix them with the table in `Expected Test Outputs`.

### Text Embeddings / Reranking / Classification

No persistent generation KV cache.

```txt
encoder_activation_gb = 2 * concurrent_requests * sequence_tokens * num_layers * hidden_size * activation_bytes / 1e9
working_memory_gb = encoder_activation_gb
```

### Encoder-Decoder Generation

```txt
encoder_activation_gb = 2 * concurrent_requests * input_tokens * num_layers * hidden_size * activation_bytes / 1e9
decoder_kv_gb = concurrent_requests * output_tokens * 2 * num_layers * kv_heads * head_dim * kv_bytes / 1e9
cross_attention_scratch_gb = weights_gb * 0.05
working_memory_gb = encoder_activation_gb + decoder_kv_gb + cross_attention_scratch_gb
```

### Vision Understanding

```txt
image_tokens = ceil(image_width / patch_size) * ceil(image_height / patch_size) + 1
vision_transformer_working_gb = 2 * concurrent_requests * image_tokens * num_layers * hidden_size * activation_bytes / 1e9
vision_pixel_proxy_gb = concurrent_requests * image_width * image_height * 4 * activation_bytes * 8 / 1e9
working_memory_gb = max(vision_transformer_working_gb, vision_pixel_proxy_gb)
```

### Vision-Language / Multimodal

```txt
multimodal_image_tokens = image_count * ceil(image_width / patch_size) * ceil(image_height / patch_size)
effective_context_tokens = text_tokens + multimodal_image_tokens
multimodal_kv_gb = concurrent_requests * effective_context_tokens * 2 * num_layers * kv_heads * head_dim * kv_bytes / 1e9
multimodal_vision_working_gb = 2 * concurrent_requests * multimodal_image_tokens * vision_layers * vision_hidden_size * activation_bytes / 1e9
projector_scratch_gb = weights_gb * 0.02
working_memory_gb = multimodal_kv_gb + multimodal_vision_working_gb + projector_scratch_gb
```

If vision architecture is missing, use the vision pixel proxy for `multimodal_vision_working_gb`.

### Image Generation / Diffusion

```txt
latent_height = ceil(output_image_height / latent_downsample)
latent_width = ceil(output_image_width / latent_downsample)
diffusion_latent_gb = concurrent_requests * latent_height * latent_width * latent_channels * activation_bytes / 1e9
working_memory_gb = max(diffusion_latent_gb * 64, weights_gb * 0.35)
```

### Video Generation

```txt
latent_height = ceil(video_height / latent_downsample)
latent_width = ceil(video_width / latent_downsample)
latent_frames = ceil(frames / temporal_downsample)
video_latent_gb = concurrent_requests * latent_frames * latent_height * latent_width * latent_channels * activation_bytes / 1e9
working_memory_gb = max(video_latent_gb * 96, weights_gb * 0.50)
```

### Speech / Audio

```txt
audio_tokens = audio_seconds * audio_tokens_per_second
working_memory_gb = 2 * concurrent_requests * audio_tokens * num_layers * hidden_size * activation_bytes / 1e9
```

### Tabular / Classical ML

```txt
tabular_batch_gb = rows_per_batch * features * feature_bytes / 1e9
working_memory_gb = tabular_batch_gb * 4
```

### Custom / Unknown

```txt
working_memory_gb = weights_gb * 0.25 * input_size_multiplier
```

Confidence is `Rough`.

### Training

For neural workloads, replace inference working memory with family training working memory that includes training activations and family scratch/latent memory.

Generic transformer training activation estimate:

```txt
training_activation_gb = activation_factor_training * micro_batch_size * sequence_or_token_count * num_layers * hidden_size * activation_bytes / 1e9
```

LoRA:

```txt
adapter_params_b = total_params_b * lora_trainable_percent / 100
training_state_gb = adapter_params_b * (adapter_weight_bytes + gradient_bytes + optimizer_bytes)
```

QLoRA:

```txt
weights_gb = resident_params_b * 0.5 * 1.15
training_state_gb = adapter_params_b * (adapter_weight_bytes + gradient_bytes + optimizer_bytes)
```

Full training:

```txt
weights_gb = total_params_b * weight_bytes
training_state_gb = total_params_b * (master_weight_bytes + gradient_bytes + optimizer_bytes)
```

Full training total must include weights, master weights, gradients, optimizer state, activations, runtime overhead, and buffer.

## Hardware, Speed, and Cost

Hardware recommendation:

```txt
minimum_raw_vram_gb = required_gb / gpu_utilization_target
recommended_gpu_tier_gb = smallest tier where tier_gb >= minimum_raw_vram_gb
```

GPU tiers:

```txt
8 GB, 12 GB, 16 GB, 24 GB, 48 GB, 80 GB, 160 GB, 320 GB
```

Labels:

```txt
8 GB: Entry local GPU class
12 GB: Mid-range consumer GPU class
16 GB: Larger consumer / small workstation class
24 GB: High-end consumer GPU class, e.g. RTX 3090 / RTX 4090
48 GB: Workstation GPU class or sharded multi-GPU
80 GB: Datacenter GPU class, e.g. A100/H100 80GB
160 GB: 2x 80GB GPUs with memory sharding
320 GB: 4x 80GB GPUs with memory sharding
> 320 GB: Distributed multi-node or heavy offload
```

Do not imply multiple GPUs help unless memory sharding is enabled or explicitly required.

Compare with my GPU:

```txt
my_usable_vram_gb = my_gpu_raw_vram_gb * gpu_utilization_target
fits_my_gpu = required_gb <= my_usable_vram_gb
```

Show the offload warning only for Local / Edge when the user entered a GPU and it does not fit.

Speed estimate:

```txt
compute_weight_gb = weights_gb for dense models
compute_weight_gb = active_params_b * weight_bytes * weight_overhead for MoE models
speed_estimate = max(0.1, memory_bandwidth_gbps / compute_weight_gb)
```

Bandwidth presets:

```txt
8 GB: 272 GB/s
12 GB: 504 GB/s
16 GB: 448 GB/s
24 GB: 936 GB/s
48 GB: 768 GB/s
80 GB: 2039 GB/s
160 GB: 4078 GB/s
320 GB: 8156 GB/s
```

Cloud cost:

```txt
cloud_cost_per_hour = recommended_gpu_count * hourly_rate_for_recommended_tier
```

Show only for `Server / Cloud`.

Static defaults:

```txt
8 GB: $0.25/hr
12 GB: $0.40/hr
16 GB: $0.60/hr
24 GB: $1.00/hr
48 GB: $1.50/hr
80 GB: $2.50/hr
160 GB: $5.00/hr
320 GB: $10.00/hr
```

Always label cloud cost:

```txt
Static estimate. Actual pricing varies by provider, region, GPU model, commitment, and availability.
```

Delete old formulas everywhere:

```txt
KV = Active_P / 10
Base KV Cache = (Active_P / 10) * (Context_Window / 8000) * (KV_Bits / 16)
QLoRA = 4 GB flat
Full Training = Total_P * 16 as final result
Task Type sets T to 16x multiplier
Batch size only scales KV cache for all tasks
```

Allowed note:

```txt
Full training parameter state can be around 16 bytes per parameter under mixed-precision AdamW, but final training memory must also include activations, working memory, runtime overhead, and buffer.
```

Frontend TypeScript structure, unit tests, Playwright tests, commands, and corrected expected output table live in `specs/frontend.md`.

## Documentation Scope

README should explain the product, supported workload families, estimate limitations, confidence modes, run/build/test commands, and known limitations.

Backend runtime cleanup details live in `specs/backend.md`. Frontend run/build/test details live in `specs/frontend.md`.

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
22. Optional Compare with my GPU is advanced-only and does not affect recommendation.
23. Speed estimate label adapts by workload.
24. Cloud cost does not claim current pricing unless a source/catalog exists.
25. Confidence label is always visible.
26. No old wrong formulas remain.
27. All calculations run in frontend TypeScript.
28. README is updated.
29. Unit tests pass.
30. Build passes.
31. E2E tests pass or exact blocker is documented.
```
