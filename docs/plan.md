# AI Deployment VRAM Calculator

## Goal

Refactor the existing AI deployment calculator into a simple, multi-family GPU VRAM calculator that runs, builds, and loads completely with Javascript, no Python.

The calculator must support:

1. Decoder / autoregressive text generation.
2. Encoder models: embeddings, rerankers, classifiers.
3. Encoder-decoder models: summarization, translation, T5-style generation.
4. Vision models: classification, detection, segmentation.
5. Vision-language / multimodal models.
6. Image generation / diffusion.
7. Video generation.
8. Speech / audio models.
9. Tabular / classical ML.
10. Custom / unknown models.

The app must be simple for non-hardware users, but honest and trustworthy enough for engineers. Do not pretend one equation covers all AI workloads.

## Architecture Decision

Use frontend TypeScript as the calculation source of truth.

The new path should port formulas into `frontend/src/`, build the report locally, and stop relying on `/api/report`.

Target:

```txt
Vite frontend
TypeScript calculation logic
No required FastAPI API call
No required /api/report
No WSGI
No duplicate Python formula logic
```

Move formulas into the frontend immediately. Minimize the number of new files you create.

## Current UI Problems

The current UI exposes:

```txt
Parameters
Context window
Quantization
KV cache
Runtime
Architecture
Active parameters
Training checkbox
LoRA checkbox
```

#### Current Problems:

```txt
Architecture = Dense is LLM-specific.
KV cache is not relevant to most AI workloads.
Active parameters should only appear for MoE.
Training + LoRA checkboxes create invalid combinations.
Context window should be adaptive: tokens, image size, audio length, frames, rows/features.
```

Replace the LLM-only UI with a workload-family UI.

## Minimal Visible Inputs

Show only these by default:

```txt
1. Workload Family
2. Total Resident Parameters
3. Parameter Unit
4. Precision / Format
5. Execution Mode
6. Runtime Profile
7. Input Size
8. Workload Size
9. MoE Model checkbox, only when relevant
```

Hide everything else under:

```txt
Advanced assumptions
```

## Input 1 — Workload Family

UI label:

```txt
Workload Family
```

Options:

```txt
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
```

Internal enum:

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

Default:

```txt
Text generation / chat
```

This field is mandatory. Without it, the app cannot know whether the important input is context length, image resolution, video frames, audio length, or tabular batch size.

## Input 2 — Total Resident Parameters

UI label:

```txt
Total Parameters
```

Default:

```txt
8
```

Meaning:

```txt
The number of parameters that must be resident in GPU memory.
```

For single-model workloads:

```txt
Use total model parameters.
```

For multimodal/diffusion pipelines:

```txt
Use total resident pipeline parameters:
main model + encoders + decoder/VAE/projector/adapters that stay loaded.
```

For GGUF:

```txt
If exact GGUF file size is known, prefer Advanced > Known Model File Size over parameter-based weight estimation.
```

Why: GGUF quantization has mixed quantization types and metadata; file size is often a better practical proxy than “4-bit” alone. llama.cpp’s GGUF quantization flow converts HF models to GGUF and then quantizes the GGUF file; multimodal models may require separate multimodal encoder/projector GGUF components. ([GitHub][4])

Validation:

```txt
value > 0
```

## Input 3 — Parameter Unit

UI label:

```txt
Unit
```

Options:

```txt
B
M
K
```

Default:

```txt
B
```

Conversion:

```ts
if (unit === "B") totalParamsB = value;
if (unit === "M") totalParamsB = value / 1000;
if (unit === "K") totalParamsB = value / 1_000_000;
```

Use decimal GB:

```txt
1 GB = 1e9 bytes
```

Because parameters are stored in billions:

```txt
params_B * bytes_per_param = GB
```

## Input 4 — Precision / Format

UI label:

```txt
Precision
```

Visible options:

```txt
4-bit
5-bit GGUF
6-bit GGUF
8-bit
16-bit
32-bit
```

Default:

```txt
16-bit
```

Map:

```ts
4-bit:
  weightBytes = 0.5
  weightOverhead = 1.15

5-bit GGUF:
  weightBytes = 0.625
  weightOverhead = 1.12

6-bit GGUF:
  weightBytes = 0.75
  weightOverhead = 1.10

8-bit:
  weightBytes = 1
  weightOverhead = 1.05

16-bit:
  weightBytes = 2
  weightOverhead = 1.00

32-bit:
  weightBytes = 4
  weightOverhead = 1.00
```

Advanced exact format options:

```txt
fp32
fp16
bf16
int8
fp8
GGUF Q4
GGUF Q5
GGUF Q6
GGUF Q8
GPTQ
AWQ
NF4 / QLoRA
bitsandbytes 8-bit
```

bitsandbytes supports quantized linear layers, 8-bit optimizers, and 4-bit/QLoRA-style loading; Hugging Face notes its quantization can work for any modality when the model uses supported linear layers. ([Hugging Face][5])

## Input 5 — Execution Mode

UI label:

```txt
Execution Mode
```

Options:

```txt
Inference
LoRA fine-tuning
QLoRA fine-tuning
Full training
```

Default:

```txt
Inference
```

Rules:

```txt
LoRA and QLoRA are training modes.
Do not represent training and LoRA as two independent checkboxes.
Disable LoRA/QLoRA for tabular/classical ML unless Custom mode is selected.
```

LoRA freezes base weights and trains low-rank adapter matrices; QLoRA trains LoRA adapters through a frozen 4-bit quantized base model, not a flat 4 GB overhead. ([arXiv][6]) ([arXiv][7])

## Input 6 — Runtime Profile

UI label:

```txt
Runtime
```

Options:

```txt
Local / Edge
Server / Cloud
Training
```

Default:

```txt
Local / Edge
```

Map:

```ts
Local / Edge:
  runtimeOverheadGB = 0.5
  buffer = 1.05
  gpuUtilizationTarget = 0.90

Server / Cloud:
  runtimeOverheadGB = 1.5
  buffer = 1.10
  gpuUtilizationTarget = 0.85

Training:
  runtimeOverheadGB = 4.0
  buffer = 1.25
  gpuUtilizationTarget = 0.80
```

If execution mode is LoRA, QLoRA, or Full training:

```ts
effectiveRuntimeProfile = "Training";
```

PyTorch uses a CUDA caching allocator, and recent PyTorch docs explain that allocation patterns can create fragmentation where enough total free memory exists but a request still cannot be served. Keep the buffer; do not claim PyTorch memory is exact. ([PyTorch Docs][8])

## Input 7 — Input Size

This field changes by workload family.

### Text generation / chat

```txt
Label: Context Window
Default: 8000 tokens
Meaning: prompt tokens + generated tokens retained in KV cache
```

### Text embeddings / reranking / classification

```txt
Label: Sequence Length
Default: 512 tokens
```

### Encoder-decoder generation

```txt
Labels:
- Input Sequence Length
- Output Tokens

Defaults:
- Input Sequence Length = 1024
- Output Tokens = 256
```

### Vision understanding

```txt
Label: Image Size
Default: 1024 x 1024
Presets: 224, 512, 1024, 2048, Custom
```

### Vision-language / multimodal

```txt
Labels:
- Text Context Tokens
- Image Size

Defaults:
- Text Context Tokens = 8000
- Image Size = 1024 x 1024
```

Advanced default:

```txt
Image Count = 1
```

### Image generation / diffusion

```txt
Label: Output Image Size
Default: 1024 x 1024
Presets: 512, 768, 1024, 1536, Custom
```

Diffusers warns that memory-reduction techniques need adjustment depending on the model, and transformer-based diffusion models may not benefit the same way as UNet-based models. Label diffusion results as estimated unless component sizes or measured peak memory are supplied. ([Hugging Face][3])

### Video generation

```txt
Labels:
- Output Resolution
- Frames

Defaults:
- Output Resolution = 720p
- Frames = 81
```

### Speech / audio

```txt
Label: Audio Length
Default: 30 seconds
```

### Tabular / classical ML

```txt
Labels:
- Rows per batch
- Features

Defaults:
- Rows per batch = 10000
- Features = 100
```

### Custom / unknown

```txt
Label: Input Size Multiplier
Default: 1.0
```

## Input 8 — Workload Size

This field adapts to execution mode.

For inference:

```txt
Label: Concurrent Requests
Default: 1
Validation: value >= 1
```

For training/fine-tuning:

```txt
Label: Micro Batch Size
Default: 1
Validation: value >= 1
```

Do not label this just “Batch Size.” It is ambiguous. In generation, it scales KV cache. In training, micro batch size primarily scales activation memory.

## Input 9 — MoE Model

Show only for transformer-like or custom families:

```txt
Text generation / chat
Text embeddings / reranking / classification
Encoder-decoder generation
Vision-language / multimodal
Custom / unknown
```

UI:

```txt
[ ] MoE Model
```

If checked, reveal:

```txt
Active Parameters
```

Default:

```txt
Active Parameters = Total Resident Parameters
```

Validation:

```txt
0 < activeParamsB <= totalParamsB
```

Calculation rule:

```ts
residentParamsB = totalParamsB;
computeParamsB = moeEnabled ? activeParamsB : totalParamsB;
```

Active parameters affect rough speed/compute estimates. They do not reduce resident weight memory unless expert offload or expert parallelism is explicitly enabled in advanced mode. Hugging Face’s MoE writeup distinguishes total parameters/model capacity from active parameters/inference speed and separately describes expert parallelism as the mechanism that distributes expert weights across devices. ([Hugging Face][9])

## Advanced Assumptions

Collapsed by default.

Include:

```txt
Exact model config JSON
Known model file size
Pipeline component parameters
KV cache precision
Architecture fields
Training settings
Runtime overhead
Safety buffer
Compare with my GPU
Cloud rate table
Measured peak VRAM override
```

## Advanced Exact Config

For transformer-like models, allow:

```txt
Paste model config JSON
```

Parse:

```txt
num_hidden_layers
hidden_size
num_attention_heads
num_key_value_heads
head_dim
vocab_size
is_encoder_decoder
```

Aliases:

```txt
n_layer -> num_hidden_layers
n_embd -> hidden_size
n_head -> num_attention_heads
n_head_kv -> num_key_value_heads
```

Rules:

```ts
if (!head_dim) head_dim = hidden_size / num_attention_heads;
if (!num_key_value_heads) num_key_value_heads = num_attention_heads;
```

Show:

```txt
Accuracy mode: Config-based
```

If absent:

```txt
Accuracy mode: Estimated
```

## Advanced Known Model File Size

For GGUF and other quantized file formats:

```txt
Known Model File Size
[number] GB
```

If supplied:

```ts
weightsGB = knownModelFileSizeGB * gpuResidentFraction;
```

Default:

```ts
gpuResidentFraction = 1.0;
```

This is the best practical path for GGUF because GGUF quantization can mix tensor types and include metadata.

## Advanced Pipeline Component Parameters

For multimodal, diffusion, and video:

```txt
Main model / denoiser parameters
Text encoder parameters
Vision encoder parameters
Projector parameters
VAE parameters
ControlNet / adapter parameters
Other resident module parameters
```

If supplied:

```ts
totalParamsB =
  mainParamsB
  + textEncoderParamsB
  + visionEncoderParamsB
  + projectorParamsB
  + vaeParamsB
  + adapterParamsB
  + otherParamsB;
```

Show:

```txt
Accuracy mode: Component-based
```

## Advanced KV Cache Precision

KV cache is only relevant to autoregressive generation and generative multimodal models.

Do not show globally.

Default:

```ts
kvBytes = 2;
kvLabel = "16-bit KV cache";
```

Advanced options:

```txt
16-bit
8-bit / FP8
```

Map:

```ts
16-bit:
  kvBytes = 2

8-bit / FP8:
  kvBytes = 1
```

Do not show 4-bit KV cache in the main UI. vLLM documents FP8 KV cache as a way to reduce memory footprint and support longer context windows; Hugging Face documents KV cache quantization/offloading as memory-saving tradeoffs for generation.

## Universal Weight Formula

For all neural families:

```ts
weightsGB =
  residentParamsB
  * weightBytes
  * weightOverhead;
```

If `knownModelFileSizeGB` is provided:

```ts
weightsGB = knownModelFileSizeGB * gpuResidentFraction;
```

## Universal Required Memory Formula

```ts
subtotalGB =
  weightsGB
  + workingMemoryGB
  + trainingStateGB
  + runtimeOverheadGB;

safetyBufferGB =
  subtotalGB * (buffer - 1);

requiredGB =
  subtotalGB * buffer;
```

Round displayed values to one decimal. Keep internal values unrounded.

## Family Formula: Text Generation / Chat

Use decoder transformer formula.

KV cache:

```ts
kvGB =
  concurrentRequests
  * contextTokens
  * 2
  * numLayers
  * numKVHeads
  * headDim
  * kvBytes
  / 1e9;
```

The `2` is key + value.

NVIDIA’s formula uses `2 * num_layers * (num_heads * dim_head) * precision_bytes` per token, then multiplies by batch size and sequence length. ([NVIDIA Developer][1])

Working memory:

```ts
workingMemoryGB = kvGB + decoderScratchGB;
```

Default decoder scratch:

```ts
decoderScratchGB = weightsGB * scratchRatio;
scratchRatio:
  Local / Edge = 0.03
  Server / Cloud = 0.05
```

Label scratch as:

```txt
Runtime scratch estimate
```

Do not hide it inside “task overhead.”

## Family Formula: Text Encoder

Used for embeddings, rerankers, classifiers.

No persistent generation KV cache.

Working memory:

```ts
encoderActivationGB =
  activationFactor
  * concurrentRequests
  * sequenceTokens
  * numLayers
  * hiddenSize
  * activationBytes
  / 1e9;
```

Defaults:

```ts
activationBytes = 2
activationFactor = 2 for inference
```

If exact architecture missing, estimate architecture and show `Accuracy mode: Estimated`.

## Family Formula: Encoder-Decoder

Used for translation, summarization, T5-style generation.

Components:

```ts
encoderActivationGB =
  activationFactor
  * concurrentRequests
  * inputTokens
  * encoderLayers
  * hiddenSize
  * activationBytes
  / 1e9;

decoderKVGB =
  concurrentRequests
  * outputTokens
  * 2
  * decoderLayers
  * numKVHeads
  * headDim
  * kvBytes
  / 1e9;
```

Working memory:

```ts
workingMemoryGB = encoderActivationGB + decoderKVGB + crossAttentionScratchGB;
```

Default:

```ts
crossAttentionScratchGB = 0.05 * weightsGB;
```

Show breakdown separately:

```txt
Encoder activations
Decoder KV cache
Cross-attention scratch
```

## Family Formula: Vision Understanding

Used for classification, detection, segmentation.

If ViT-style:

```ts
imageTokens =
  ceil(imageHeight / patchSize)
  * ceil(imageWidth / patchSize)
  + 1;

visionWorkingGB =
  activationFactor
  * concurrentRequests
  * imageTokens
  * numLayers
  * hiddenSize
  * activationBytes
  / 1e9;
```

Defaults:

```ts
patchSize = 16
activationBytes = 2
activationFactor = 2
```

For CNN/detector/segmenter fallback:

```ts
imagePixelProxyGB =
  concurrentRequests
  * imageHeight
  * imageWidth
  * channels
  * activationBytes
  * visionActivationMultiplier
  / 1e9;
```

Defaults:

```ts
channels = 4
visionActivationMultiplier = 8
```

Use:

```ts
workingMemoryGB = max(visionWorkingGB, imagePixelProxyGB);
```

Label:

```txt
Vision memory is estimated. Exact memory depends on backbone, feature maps, detector/segmentation head, image size, and implementation.
```

## Family Formula: Vision-Language / Multimodal

Used for image-to-text, image-text-to-text, document QA, multimodal chat.

Image tokens:

```ts
imageTokens =
  imageCount
  * ceil(imageHeight / patchSize)
  * ceil(imageWidth / patchSize);
```

Default:

```ts
imageCount = 1
patchSize = 16
```

Effective text context:

```ts
effectiveContextTokens = textContextTokens + imageTokens;
```

If generative:

```ts
kvGB =
  concurrentRequests
  * effectiveContextTokens
  * 2
  * numLayers
  * numKVHeads
  * headDim
  * kvBytes
  / 1e9;
```

Vision working memory:

```ts
visionWorkingGB =
  activationFactor
  * concurrentRequests
  * imageTokens
  * visionLayers
  * visionHidden
  * activationBytes
  / 1e9;
```

If vision architecture missing:

```ts
visionWorkingGB = imagePixelProxyGB;
```

Working memory:

```ts
workingMemoryGB = kvGB + visionWorkingGB + projectorScratchGB;
```

Default:

```ts
projectorScratchGB = 0.02 * weightsGB;
```

## Family Formula: Image Generation / Diffusion

Do not use KV cache as the main concept.

Inputs:

```txt
output image height
output image width
concurrent requests
```

Latents:

```ts
latentHeight = ceil(imageHeight / latentDownsample);
latentWidth = ceil(imageWidth / latentDownsample);
```

Defaults:

```ts
latentDownsample = 8
latentChannels = 4
activationBytes = 2
```

Latent memory:

```ts
diffusionLatentGB =
  concurrentRequests
  * latentHeight
  * latentWidth
  * latentChannels
  * activationBytes
  / 1e9;
```

Working estimate:

```ts
diffusionWorkingGB =
  max(
    diffusionLatentGB * diffusionActivationMultiplier,
    weightsGB * diffusionWeightPeakRatio
  );
```

Defaults:

```ts
diffusionActivationMultiplier = 64
diffusionWeightPeakRatio = 0.35
```

Label:

```txt
Diffusion estimate is heuristic unless exact pipeline components or measured peak VRAM are provided.
```

## Family Formula: Video Generation

Inputs:

```txt
output height
output width
frames
concurrent requests
```

Latents:

```ts
latentHeight = ceil(videoHeight / latentDownsample);
latentWidth = ceil(videoWidth / latentDownsample);
latentFrames = ceil(frames / temporalDownsample);
```

Defaults:

```ts
latentDownsample = 8
temporalDownsample = 4
latentChannels = 4
activationBytes = 2
```

Working estimate:

```ts
videoLatentGB =
  concurrentRequests
  * latentFrames
  * latentHeight
  * latentWidth
  * latentChannels
  * activationBytes
  / 1e9;

videoWorkingGB =
  max(
    videoLatentGB * videoActivationMultiplier,
    weightsGB * videoWeightPeakRatio
  );
```

Defaults:

```ts
videoActivationMultiplier = 96
videoWeightPeakRatio = 0.50
```

Label:

```txt
Video generation estimate is rough. Exact VRAM depends on architecture, frame count, attention implementation, resolution, offload, and pipeline components.
```

## Family Formula: Speech / Audio

Inputs:

```txt
audio seconds
concurrent requests
```

Convert to tokens/features:

```ts
audioTokens = audioSeconds * audioTokensPerSecond;
```

Default:

```ts
audioTokensPerSecond = 50
```

Working memory:

```ts
audioWorkingGB =
  activationFactor
  * concurrentRequests
  * audioTokens
  * numLayers
  * hiddenSize
  * activationBytes
  / 1e9;
```

If architecture missing:

```txt
Use estimated transformer architecture and show Estimated confidence.
```

Label:

```txt
Audio estimate depends on feature extraction, sample rate, chunking, and architecture.
```

## Family Formula: Tabular / Classical ML

Inputs:

```txt
rows per batch
features
```

Dataset batch memory:

```ts
tabularBatchGB =
  rowsPerBatch
  * features
  * featureBytes
  / 1e9;
```

Default:

```ts
featureBytes = 4
tabularWorkingMultiplier = 4
```

Working memory:

```ts
workingMemoryGB =
  tabularBatchGB * tabularWorkingMultiplier;
```

Total:

```ts
requiredGB =
  (weightsGB + workingMemoryGB + runtimeOverheadGB) * buffer;
```

Label:

```txt
For tabular/classical ML, CPU RAM and dataset size often matter more than GPU VRAM.
```

## Custom / Unknown Formula

Use:

```ts
workingMemoryGB =
  weightsGB * customWorkingMultiplier * inputSizeMultiplier;
```

Defaults:

```ts
customWorkingMultiplier = 0.25
inputSizeMultiplier = 1.0
```

Confidence:

```txt
Rough
```

## Training Formula

For neural workloads, training adds parameter state and activation memory. Do not use `Total_P * 16` as the final formula.

Hugging Face lists mixed-precision model weights, Adam optimizer states, gradients, forward activations, temporary tensors, and extra feature overhead as GPU memory consumers. ([Hugging Face][2])

Defaults:

```ts
activationBytes = 2
gradientBytes = 2
masterWeightBytes = 4
optimizerBytes = 8 // AdamW
gradientCheckpointing = true
```

Activation factor:

```ts
if (gradientCheckpointing) activationFactor = 3;
else activationFactor = 8;
```

Optimizer map:

```ts
AdamW:
  optimizerBytes = 8

8-bit Adam:
  optimizerBytes = 2

SGD-like:
  optimizerBytes = 4
```

### Full Training

```ts
baseWeightsGB =
  totalParamsB * weightBytes;

masterWeightsGB =
  totalParamsB * masterWeightBytes;

gradientsGB =
  totalParamsB * gradientBytes;

optimizerStateGB =
  totalParamsB * optimizerBytes;

trainingStateGB =
  baseWeightsGB
  + masterWeightsGB
  + gradientsGB
  + optimizerStateGB;
```

Add family-specific training activations:

```ts
workingMemoryGB =
  familyWorkingMemoryWithTrainingActivationFactor;
```

### LoRA Fine-Tuning

Default trainable adapter parameters:

```ts
adapterParamsB =
  totalParamsB * loraTrainableRatio;
```

Default:

```ts
loraTrainableRatio = 0.005
```

Advanced exact LoRA formula:

```ts
adapterParams =
  sum over adapted linear layers:
    rank * (inputDim + outputDim);

adapterParamsB = adapterParams / 1e9;
```

LoRA state:

```ts
adapterWeightsGB =
  adapterParamsB * 2;

adapterGradientsGB =
  adapterParamsB * gradientBytes;

adapterOptimizerStateGB =
  adapterParamsB * optimizerBytes;

trainingStateGB =
  adapterWeightsGB
  + adapterGradientsGB
  + adapterOptimizerStateGB;
```

Total LoRA memory:

```ts
requiredGB =
  (
    baseWeightsGB
    + familyTrainingWorkingMemoryGB
    + trainingStateGB
    + runtimeOverheadGB
  )
  * buffer;
```

### QLoRA Fine-Tuning

Force base weight precision:

```ts
weightBytes = 0.5;
weightOverhead = 1.15;
```

Base weights:

```ts
quantizedBaseWeightsGB =
  residentParamsB * 0.5 * 1.15;
```

Adapter state is the same as LoRA.

Total QLoRA memory:

```ts
requiredGB =
  (
    quantizedBaseWeightsGB
    + familyTrainingWorkingMemoryGB
    + adapterWeightsGB
    + adapterGradientsGB
    + adapterOptimizerStateGB
    + runtimeOverheadGB
  )
  * buffer;
```

## Hardware Recommendation

Do not ask for target GPU VRAM in the main form.

Calculate:

```ts
minimumRawVRAMGB =
  requiredGB / gpuUtilizationTarget;
```

GPU tiers:

```ts
[8, 12, 16, 24, 48, 80, 160, 320]
```

Recommend the smallest tier where:

```ts
tierGB >= minimumRawVRAMGB;
```

Output:

```txt
Recommended Hardware
24 GB GPU class

Required memory: X GB
Usable target: Y%
Minimum raw VRAM needed: Z GB
```

Example:

```txt
Required memory = 20.1 GB
Local usable target = 90%
Minimum raw VRAM = 20.1 / 0.90 = 22.3 GB
Recommendation = 24 GB GPU class
```

Do not just output:

```txt
RTX 4090
```

Output:

```txt
24 GB GPU class, e.g. RTX 3090 / RTX 4090
```

For multi-GPU tiers:

```txt
Requires memory sharding support.
```

Do not imply multiple GPUs automatically help.

## Optional Compare With My GPU

Hide under Advanced.

UI:

```txt
Compare with my GPU
[number] GB VRAM
```

Calculation:

```ts
myUsableVRAMGB =
  myRawVRAMGB * gpuUtilizationTarget;

fitsMyGPU =
  requiredGB <= myUsableVRAMGB;
```

Slow mode warning only if runtime is Local / Edge and the user entered a GPU:

```txt
Memory exceeds GPU VRAM. Local runtimes may offload to system RAM, which can significantly reduce speed.
```

## Speed Estimate

Output label adapts by workload:

```txt
Text generation: Estimated tokens/sec
Text encoder / vision / tabular: Estimated samples/sec
Image generation: Estimated images/min
Video generation: Estimated videos/hour or seconds/frame
Audio: Estimated audio seconds/sec
```

For text-generation-like workloads:

```ts
computeWeightGB =
  moeEnabled
    ? activeParamsB * weightBytes * weightOverhead
    : weightsGB;

speed =
  memoryBandwidthGBps / computeWeightGB;
```

For non-text workloads, show lower confidence unless a benchmark profile exists.

Hardware bandwidth table:

```ts
8 GB:   272
12 GB:  504
16 GB:  448
24 GB:  936
48 GB:  768
80 GB:  2039
160 GB: 4078
320 GB: 8156
```

Clamp:

```ts
speed = Math.max(0.1, speed);
```

Label:

```txt
Rough estimate. Real speed depends on GPU model, runtime, kernels, batching, quantization, input size, and offload.
```

## Cloud Cost Estimate

Do not claim current pricing unless live pricing is fetched.

Use one of these:

```txt
A configured static cost catalog in frontend/src/hardware.ts
Existing repo cost data ported from Python
User-provided $/hour under Advanced assumptions
```

Formula:

```ts
cloudCostPerHour =
  recommendedGpuCount * hourlyRateForRecommendedTier;
```

If no rate exists:

```txt
Estimated cloud cost: not configured
```

If static rate is used:

```txt
Static estimate. Actual pricing varies by provider, region, GPU model, commitment, and availability.
```

## Output Layout

Main result panel:

```txt
Total Required Memory
X.X GB

Recommended Hardware
24 GB GPU class

Minimum Raw VRAM Needed
X.X GB

Estimated Speed
X tokens/sec or samples/sec

Estimated Cloud Cost
$X.XX/hr or Not configured

Accuracy
Config-based / Component-based / Estimated / Rough
```

Breakdown:

```txt
Model / pipeline weights: X.X GB
KV cache: X.X GB
Input / activation memory: X.X GB
Training state: X.X GB
Runtime overhead: X.X GB
Safety buffer: X.X GB
```

Hide zero rows.

Do not show generic `Task Overhead`. It hides too much.

## Confidence Labels

Use:

```txt
Config-based
Component-based
File-size-based
Estimated
Rough
```

Rules:

```ts
if exact model config provided:
  confidence = "Config-based"

else if pipeline component parameters provided:
  confidence = "Component-based"

else if known model file size provided:
  confidence = "File-size-based"

else if workload family has formula + hidden defaults:
  confidence = "Estimated"

else:
  confidence = "Rough"
```

Always show:

```txt
Estimates use heuristics. Real usage varies with exact architecture, runtime, kernels, quantization, sharding, offload settings, and implementation.
```

## UI Changes From Screenshot

Replace:

```txt
Parameters (billions)
```

with:

```txt
Total Resident Parameters
```

Add:

```txt
Workload Family
```

Replace:

```txt
Quantization
```

with:

```txt
Precision
```

Replace fixed:

```txt
Context window
```

with adaptive labels:

```txt
Context Window
Sequence Length
Input Tokens / Output Tokens
Image Size
Output Image Size
Resolution + Frames
Audio Length
Rows + Features
```

Remove from main UI:

```txt
KV cache
Architecture
Dense
Active parameters visible by default
Training checkbox
LoRA checkbox
Target GPU
Custom GPU
```

Add:

```txt
Execution Mode dropdown
Runtime Profile dropdown
Workload Size adaptive field
MoE checkbox when relevant
Advanced assumptions
```

## Formulas To Delete

Delete these everywhere:

```txt
KV = Active_P / 10

Base KV Cache =
(Active_P / 10)
* (Context_Window / 8000)
* (KV_Bits / 16)

QLoRA = 4 GB flat

Full Training = Total_P * 16 as final result

Task Type sets T to 16x multiplier

Batch size only scales KV cache for all tasks
```

Allowed note:

```txt
Full training parameter state can be around 16 bytes per parameter under mixed-precision AdamW, but final training memory must also include activations, working memory, runtime overhead, and buffer.
```

## TypeScript Structure

Preferred files:

```txt
frontend/src/types.ts
frontend/src/state.ts
frontend/src/families.ts
frontend/src/calculator.ts
frontend/src/hardware.ts
frontend/src/report.ts
frontend/src/render.ts
frontend/src/validation.ts
frontend/src/app.ts
```

If adding files is not allowed, fold logic into existing files but keep functions small.

Suggested functions:

```ts
normalizeFormState(raw): CalculatorInputs

getFamilyPreset(family): FamilyPreset

estimateArchitecture(inputs): ArchitectureEstimate

calculateWeights(inputs): WeightBreakdown

calculateWorkingMemory(inputs, family): WorkingMemoryBreakdown

calculateTrainingState(inputs): TrainingBreakdown

calculateRequiredMemory(inputs): CalculationResult

recommendHardware(result): HardwareRecommendation

buildReport(state): ReportPayload
```

## Backend Migration

Old:

```txt
Frontend calls /api/report
Python calculates report
Frontend renders response
```

New:

```txt
Frontend normalizes state
Frontend calls buildReport(state)
Frontend renders local result
```

Remove:

```txt
/api/report dependency
fetch mocks for /api/report
real-backend Playwright tests
Python formula duplication
WSGI
```

If FastAPI remains temporarily:

```txt
FastAPI may serve frontend/dist only.
FastAPI must not own calculator formulas.
```

## Accessibility

Use semantic HTML:

```txt
main
header
section
form
label
button
output
details
summary
```

Every input must have a real label.

No clickable divs.

Warnings must include visible text, not color alone.

Use Playwright-friendly labels:

```txt
getByLabel('Workload Family')
getByLabel('Total Resident Parameters')
getByLabel('Precision')
getByLabel('Execution Mode')
getByLabel('Runtime')
getByLabel('Context Window')
getByLabel('Image Size')
getByLabel('Concurrent Requests')
getByLabel('Micro Batch Size')
getByRole('checkbox', { name: 'MoE Model' })
getByText('Total Required Memory')
```

## Tests

Unit tests:

```txt
B/M/K parameter conversion
precision-to-byte mapping
GGUF known file size overrides parameter estimate
MoE active params do not reduce resident weight memory by default
decoder KV scales with context and concurrency
encoder formula has no persistent KV cache
encoder-decoder formula includes encoder activations + decoder KV
diffusion formula uses image size and does not show KV cache
video formula scales with frames and resolution
audio formula scales with seconds
tabular formula scales with rows/features
LoRA uses adapter state, not full training state
QLoRA uses 4-bit base + adapter state, not flat 4 GB
full training includes weights, master weights, gradients, optimizer, activations
hardware recommendation uses requiredGB / utilization
20.1 GB local recommends 24 GB class with math explanation
```

Playwright tests:

```txt
default page renders
main form fits desktop viewport
workload family changes input labels
KV cache is hidden except in advanced for generative transformer families
MoE checkbox reveals Active Parameters
Advanced assumptions expands/collapses
changing parameters updates Total Required Memory
changing input size updates relevant working memory
changing execution mode updates breakdown
mobile layout does not clip controls
visual snapshot passes
```

Commands:

```sh
npm --prefix frontend run build
npm --prefix frontend run test:coverage
npm --prefix frontend run test:e2e
npm --prefix frontend run gate
```

If configured:

```sh
npx playwright test --update-snapshots
npx playwright test --project="VRAM-Calculator" --project="Mobile Safari"
```

## README Requirements

README should include:

```txt
What the app does
Supported workload families
What estimates mean
Accuracy/confidence modes
How to run frontend dev
How to build
How to test
Known limitations
```

README should not include:

```txt
FastAPI /api/report instructions if removed
WSGI instructions
old LLM-only formula
old KV = Active_P / 10 formula
old QLoRA flat 4 GB claim
internal agent notes
```

## Acceptance Criteria

Done means:

```txt
1. App supports more than LLMs.
2. Workload Family is the first/main selector.
3. Context Window is not shown for all workloads.
4. KV cache is not shown globally.
5. Architecture/Dense dropdown is removed from main UI.
6. MoE is a checkbox only when relevant.
7. Active Parameters appears only when MoE is checked.
8. Active Parameters does not reduce resident weight memory by default.
9. Decoder KV uses architecture-based formula.
10. Encoder models do not use persistent generation KV.
11. Diffusion/video models do not show KV as the main memory concept.
12. GGUF supports known file size override.
13. LoRA formula uses adapter states.
14. QLoRA formula uses quantized base + adapter states.
15. Full training includes weights, master weights, gradients, optimizer state, activations, overhead, and buffer.
16. Hardware recommendation comes from requiredGB / utilization target.
17. Optional Compare With My GPU is advanced-only.
18. Speed estimate label adapts by workload.
19. Cloud cost does not claim current pricing unless a source/catalog exists.
20. Confidence label is always visible.
21. No old wrong formulas remain.
22. Frontend no longer requires /api/report for calculation.
23. Python/FastAPI is not the formula source of truth.
24. WSGI is gone.
25. README is updated.
26. Unit tests pass.
27. Build passes.
28. E2E tests pass or exact blocker is documented.
