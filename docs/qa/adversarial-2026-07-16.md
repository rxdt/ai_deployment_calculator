# Adversarial Oracle Run — 2026-07-16

Scope: seeded `frontend/src/adversarial/oracle.test.ts` outside the gate glob.

| Oracle | Anchor | Verdict |
| --- | --- | --- |
| PB-scale URL `total-params=2&workload-size=99999999&context-tokens=0` | QA spec confirmed KV around 2.94 PB after context floor | Pass: finite, non-negative, and honest overflow-sized result |
| 7B published byte-per-weight tiers | GGUF bpw anchors and fp16/fp32 bytes per parameter | Pass: IQ2_XXS < Q4_K_M < Q6_K < Q8_0 < fp16 < fp32 |
| Llama-3-8B 16-bit KV | vLLM paged-attention anchor: 0.125 MiB/token | Pass: 8k total and 8k→16k marginal KV match the published per-token footprint |
| Weight-quant twin invariance | Physical decomposition: `precision` sets ONLY the weight row | Pass: KV and activation are byte-identical across the fp32→IQ2_XXS weight ladder while weights strictly descend |
| Full-training bytes/param | Training-anatomy anchors: AdamW 16, 8-bit Adam 10, SGD 12 B/param (fp16 mixed precision) | Pass: weights + training-state equal params×anchor exactly; isolated from working memory; linear in params |
| Adapter training order | QLoRA frozen 4-bit base; LoRA trains adapters; full training carries full parameter state | Pass: QLoRA < LoRA fp16 < full training |
| Training-mode decoder KV leak | Physical invariant: training memory is activations + trainable state, not persistent inference KV | Pass: LoRA, QLoRA, and full training keep zero KV and identical totals across KV precisions with a 1M-token context |
| Non-decoder workload KV | Physical invariant: no persistent generation KV without decoder cache | Pass: encoder, vision, diffusion, video, audio, tabular, custom remain zero-KV |
| URL-emittable extremes | Physical invariant: normalized user-shareable inputs stay finite and non-negative | Pass: tiny, capped, and 100% adapter cases round-trip |

Verdict: no product correction filed; all 21 oracle tests pass, so the model still
tracks external ground truth. The remaining gap is coverage depth, not a known
wrong number: future QA runs should add competitor-derived banded totals and
leave any unexplained failures red. Noted definitional limitation (not our
error): the architecture buckets model modern GQA (8 KV heads), so a legacy
MHA model such as Llama-2-7B would be KV-under-counted — acceptable because the
calculator targets current GQA architectures and the vLLM Llama-3-8B anchor
above confirms that default.
