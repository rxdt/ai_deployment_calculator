> Current handoff. Keep it short and current.

## Current State

- Work on the current branch. Do not auto-commit, push, pull, merge, or rebase
  without instruction.
- The frontend is not done. It is a static Vite + TypeScript calculator with a
  minimal HTML shell, local report generation, and some reactive
  `CalculatorApp` wiring.
- `frontend/src/styles.css` is reset-only. Styling has not started.

## Active Priority

1. Finish JavaScript behavior in `frontend/src/`.
2. Wire and audit `frontend/index.html` against that behavior.
3. Update `specs/frontend.md` and this file to the reviewed truth.
4. Only after all JavaScript and HTML work is exhausted, consider styling.

Styling may begin only after a thorough review of `frontend/` finds no remaining
JavaScript or HTML wiring work and the docs say so explicitly.

## Calculation Contract

- Frontend TypeScript is the calculation source of truth.
- Canonical equation: `Required_GB = (Weights + KV + Working/Activation +
Training_State + Runtime_Overhead) * Buffer`, rounded to one decimal.
- Decoder KV is architecture-based (`layers * kv_heads * head_dim * kv_bytes`),
  never `Active_P / 10`.
- QLoRA = frozen 4-bit base + adapter state. Full training = weights + master +
  grad + optimizer + activations.
- `decoder_scratch_gb` is scratch-included by product default (`weights * 0.05`
  server, `* 0.03` local). Scratch-zero is test-only.

## Frontend Reality To Review

- `frontend/index.html` contains the current form, advanced assumptions, output
  slots, and template markup. Treat it as minimal, not final.
- `frontend/src/app.ts` currently handles form normalization, numeric input
  cleanup, reset, adaptive control visibility, and report rendering.
- `frontend/src/styles.css` intentionally contains only a reset.
- Do not claim frontend parity, responsive standards, or best-practice UI
  completion until a fresh `frontend/` review proves it.

## Open Items

1. Review `frontend/` for unfinished JavaScript behavior and HTML wiring.
2. Decide whether VL pixel-proxy should multiply by `image_count`
   (`workload-memory.ts`) or match the plan's single-image wording.
3. Reconcile stale spec text around warnings and compare-with-my-GPU against the
   current source and tests.
4. After all above items are complete, decide whether to start styling from
   `specs/DESIGN.md`.

## Checks

- Do not rely on old green-check notes as proof of completion.
- After any frontend code change, run the relevant frontend tests and the
  harness gate/preflight required by the loop.

## Docs

- `specs/frontend.md` is the active frontend work spec.
- `specs/DESIGN.md` is deferred until JavaScript and HTML work is exhausted.
