# Assumption Transparency Spec

PRIORITY 1 (implemented)

## Vision

Make the calculator's fixed assumptions visible beside every result so an AI
engineer can audit the estimate without reading source code.

## Current State

The core constants are documented in README, encoded in `src/`, attached to
`DeploymentReport`, and rendered as a compact assumptions section in the web UI.

## Prioritize These Items

- Add a pure `src/` assumption-summary layer with typed dataclasses only.
- Include these assumptions:
  - safety margin is 10%;
  - CUDA/system tax is 1.5 GB;
  - KV cache uses the `(parameters / 10) * (context_k / 8)` heuristic;
  - host RAM is at least 32 GB and rounds up in 16 GB increments;
  - supported weight and KV precisions are 32-bit, 16-bit, 8-bit, and 4-bit.
- Attach the assumption summary to `DeploymentReport`.
- Render a compact assumptions section in the web output.
- Keep the section short enough for the one-page UI; no extra inputs.

## Acceptance Signals

- `uv run ralph verify` green; 100% coverage remains.
- The pure assumption layer has tests for the exact assumption labels and values.
- `build_report()` exposes the assumption summary.
- The web page includes the safety margin, CUDA tax, KV heuristic, and host RAM rule.

## Non-goals

- Live benchmarks, hardware-specific performance claims, or source citations.
- Changing the VRAM equation or adding new calculator inputs.

## Blockers
-
-

## COMPLETE ?

- [ ] TRUE
- [ ] FALSE
