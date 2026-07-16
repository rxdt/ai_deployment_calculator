# Project Status

Short, current handoff. Deleted lines are the point — keep only what's useful now.

## State (2026-07-16, pre-push)

- Local `main` = `10ba12a` + one squashed release commit (security + UX round),
  push imminent per owner directive ("get launched"), superseding the earlier
  no-agent-push note. The release commit contains:
  - **Security:** pnpm `overrides` restored (tmp, uuid, fast-json-patch,
    @opentelemetry/core — they had been dropped in `10ba12a`, reintroducing
    audit failures); `@asyncapi/specs` pinned 6.11.1 against the Miasma RAT
    attack (issue #5 — repo verified NOT compromised, safe version was always
    locked); dependency-review runs on push AND PR; a standalone semgrep CI
    job plus `pip install semgrep` in checks so the gate's sast check runs on
    runners; the gate now FAILS on a missing tool (ENOENT) instead of the old
    silent skip that let sast quietly not run in CI.
  - **UX:** result panels and hardware tier rows are exclusive accordions
    (native `details name=`); Reset restores the exact starting 7B deployment
    and clears the URL query (formerly zeroed the form and wrote the zeros
    into the URL); new ONNX preset (distilbert-base-uncased-mnli, 67M, 8-bit
    int8 export = smallest published file, verified against the HF API);
    "Formula used" is workload-aware — the KV-cache term drops for families
    that compute none (diffusion/vision/tabular/…); the blanket
    training-estimates warning is deleted; the 4th stat chip is renamed
    Spare → Headroom; intro tagline centered (`margin-inline: auto`);
    calculator-writeup gained canonical + sitemap entries.
  - **Tooling:** typescript pinned ~6.0.3; repetitive tests parameterized;
    split-limit/simple-condition lint fixes; the spawn-heavy
    `runGate defaults…` test got an explicit 30s timeout (it flaked at the
    5s default under full-gate load).
- Verification for this release: `node harness/harness.mjs gate` green
  (0 issues, all 18 checks incl. 6-project Playwright + Lighthouse), plus two
  independent naive-user agent testers drove the app in a real browser at
  320/390/768/1280: all launch checks PASS (exclusive accordions, reset+URL,
  ONNX numbers, dynamic formula, garbage-input safety, deep links, no
  horizontal scroll, zero console errors). Their non-blocking findings are
  filed as P3 in `specs/plan.md`.
- Dependabot: 0 open alerts (all 65 fixed as of 16:46 UTC). Issue #5
  (AsyncAPI/Miasma) can be closed: lockfile pins safe 6.11.1, no malicious
  version was ever installed, and the pin now prevents drift.
- Vercel deploy path: gated CI deploy job in `.github/workflows/ci.yml`
  (`needs: checks`, push-to-main only, requires `VERCEL_DEPLOY_ENABLED=true`
  and the `VERCEL_*` secrets). The new semgrep job reads
  `secrets.SEMGREP_APP_SECRET` (same name as gh_site); the owner still needs
  to add that secret — the scan runs without it, it just skips the AppSec
  upload.

## Current Local Sentinels

- Default 7B fp16 inference: 18.8 GB total, 22.2 GB minimum raw.
- 8B server inference: 21.0 GB total, 24.8 GB minimum raw.
- 8B QLoRA at 2% adapters: 21.1 GB.
- SDXL 1024x1024 image diffusion preset: 12.1 GB.
- ONNX DistilBERT preset (67M, 8-bit): 1.9 GB total, 8 GB class.
- 47B MoE high-context server case: 95.1 GB raw, 96 GB class (not the 95 GB
  TPU class).

## Open Work

- Agent priorities live in `specs/plan.md` PRIORITIES (P1 CSP/no-inline
  build, P2 topnav narrow-viewport polish, P2 security headers, P2 About
  link/writeup integration, P2 screenshot hygiene, P2 F10 oracle extension,
  P3 naive-user UX findings).
- **Owner:** add `SEMGREP_APP_SECRET` repo secret; real-device pass (iPhone
  Safari, Android Chrome); optional analytics/error monitoring.
- **Parked (do not build):** F1/F2/F5/F6/F7/F8
  (`scratchpad/DO-NOT-DO-phase2-features.md`).

## Blockers

- apxml Part A primary is blocked in headless Playwright by Cloudflare
  Turnstile; needs an owner/manual headed pass if exact ApX rows are required.

## Known Issues

- Parallel `pnpm gate` runs can collide on the dev/preview ports (5173/4173);
  kill stale vite processes or retry after the other run exits.
