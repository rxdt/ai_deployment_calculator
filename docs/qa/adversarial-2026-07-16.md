# Adversarial Oracle Run — 2026-07-16

Scope: seeded `frontend/src/adversarial/oracle.test.ts` outside the gate glob.

| Oracle | Anchor | Verdict |
| --- | --- | --- |
| PB-scale URL `total-params=2&workload-size=99999999&context-tokens=0` | QA spec confirmed KV around 2.94 PB after context floor | Pass: finite, non-negative, and honest overflow-sized result |
| 7B published byte-per-weight tiers | GGUF bpw anchors and fp16/fp32 bytes per parameter | Pass: IQ2_XXS < Q4_K_M < Q6_K < Q8_0 < fp16 < fp32 |
| Adapter training order | QLoRA frozen 4-bit base; LoRA trains adapters; full training carries full parameter state | Pass: QLoRA < LoRA fp16 < full training |
| Non-decoder workload KV | Physical invariant: no persistent generation KV without decoder cache | Pass: encoder, vision, diffusion, video, audio, tabular, custom remain zero-KV |
| URL-emittable extremes | Physical invariant: normalized user-shareable inputs stay finite and non-negative | Pass: tiny, capped, and 100% adapter cases round-trip |

Verdict: no product correction filed. The current gap is coverage depth, not a
known wrong number: future QA runs should add competitor-derived banded values
and leave any unexplained failures red.
