# Project Status

Short, current handoff. Deleted lines are the point — keep only what's useful now.

## State (2026-07-16, pre-push)

- Local `main` = `10ba12a` + one squashed release commit (security + UX round),
  push imminent per owner directive ("get launched"), superseding the earlier
  no-agent-push note. The release commit contains:
  - **Security:** pnpm `overrides` restored (tmp, uuid, fast-json-patch, @opentelemetry/core — they had been dropped in `10ba12a`, `@asyncapi/specs` pinned 6.11.1 against the Miasma RAT attack (issue #5 — repo verified NOT compromised, safe version was always locked); dependency-review runs on push AND PR; a standalone semgrep CI job plus `pip install semgrep` in checks so the gate's sast check.

## Current Local Sentinels

- Default 7B fp16 inference: 18.8 GB total, 22.2 GB minimum raw.
- 8B server inference: 21.0 GB total, 24.8 GB minimum raw.
- 8B QLoRA at 2% adapters: 21.1 GB.
- SDXL 1024x1024 image diffusion preset: 12.1 GB.
- ONNX DistilBERT preset (67M, 8-bit): 1.9 GB total, 8 GB class.
- 47B MoE high-context server case: 95.1 GB raw, 96 GB class (not the 95 GB
  TPU class).

## Open Work

- Agent priorities live in `specs/plan.md` PRIORITIES (P1 CSP/no-inline)
- **Parked (do not build):** F1/F2/F5/F6/F7/F8
  (`scratchpad/DO-NOT-DO-phase2-features.md`).

## Blockers

- apxml Part A primary is blocked in headless Playwright by Cloudflare
  Turnstile; needs an owner/manual headed pass if exact ApX rows are required.

## Known Issues

- Parallel `pnpm gate` runs can collide on the dev/preview ports (5173/4173);
  kill stale vite processes or retry after the other run exits.
