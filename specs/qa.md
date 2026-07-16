# QA Spec — External Oracles

Veracity is P0 (see `specs/plan.md`). Report-only QA proves the MODEL matches
reality, not just code. Expected values come from OUTSIDE our code:
competitors, published anchors, physical invariants. Never edit product code
from external-oracle QA; findings become dated Research Corrections in
`specs/plan.md`. Anchors beat consensus.

## Part A — Cross-calculator comparison (re-run contract)

Last run 2026-07-16: `docs/qa/comparison-2026-07-16.md` — no Research
Correction; all disagreements definitional. Re-run only after formula changes
or before a distribution push.

Drive competitor calculators with our canonical scenarios; compare per
component; triage every disagreement. Targets: vram.asmirnov.xyz,
huggingface.co/spaces/SadP0i/GGUF-Model-VRAM-Calculator, and
apxml.com/tools/vram-calculator (Cloudflare Turnstile blocks headless — needs
an owner headed pass). Scenarios: the six in the last report; read OUR numbers
live at run time — never hardcode. Method: scratch Playwright in `harness/`
(deleted after), one polite pass per target; normalize GiB-printed-as-GB to
decimal GB.

## Part B — Adversarial oracle suite

Standing red team. Audit existing tests for weaknesses, then write cases whose
assertions cite external calculators, published anchors, or physical
invariants — never our equations. Source-code failures are LEFT RED: a red
oracle test is a bug report with a reproducer.

Lives in `frontend/src/adversarial/oracle.test.ts` — deliberately OUTSIDE the
gate glob (`frontend/src/*.test.ts`) so red tests never block the gate. Must
still pass eslint/prettier. Run:
`pnpm --dir frontend exec vitest run src/adversarial --config ../harness/vitest.config.js`

Each run: (1) troll existing tests for implementation-mirroring tautologies,
unjustified pins, untested boundaries, check-one-way tests; (2) add one missing
extreme, contradiction, state→URL→state fixpoint, or banded oracle value; (3)
assert invariants EXACTLY.

Invariants: monotonic (more params / longer ctx / bigger batch never lowers
total); precision ordering fp32 ≥ fp16 ≥ Q8_0 ≥ Q6_K ≥ Q4_K_M ≥ IQ2_XXS;
quantized-twin equality (same model, two precisions → identical KV + activation
rows); QLoRA < LoRA-fp16 < full-training; every normalizer-emittable input
gives finite, non-negative, non-NaN totals; tier capacity ≥ min raw VRAM.

## Triage (every disagreement/failure gets exactly one)

- **Definitional** (GiB-as-GB, buffer/scope, KV-by-default): note, no action.
- **Their error** (contradicts a published anchor — fp16 = params×2, AdamW ~16
  B/param, vLLM KV 0.125 MiB/token Llama-3-8B, llama.cpp buffers): note with
  anchor, no action.
- **Our error** (competitor + independent anchor both disagree, or an
  indefensible assumption): FILE a dated Research Correction in `specs/plan.md`
  (+ a fix item if user-facing). Adversarial: LEAVE THE TEST RED as the
  reproducer.
- **Unexplained** (no anchor): record raw numbers as an open question; don't
  guess. Adversarial: prefix the red test `oracle-unresolved:`.

## Research questions (report-only; a run may take ONE)

- **RQ1** — "KV cache is the leading real OOM cause" (unverified). Classify
  real OOM reports by root cause (KV growth / prefill spikes / fragmentation /
  weights-too-big / other) via vLLM·llama.cpp·TGI issues + r/LocalLLaMA.
- **RQ2** — activation boundedness by stack. Naive prefill is O(ctx²);
  FlashAttention/chunked is linear-to-bounded. Establish today's DEFAULTS per
  stack → which regime our activation estimate assumes per runtime profile.

## Boundaries, output, cadence

Only writable surfaces for external-oracle QA: the oracle suite, QA report, and
plan.md corrections. Red is valid; don't weaken red tests to clean up. One
dated report per run under `docs/qa/` with table, triage, corrections, and
verdict. Cadence: after formula changes, before distribution pushes, or when no
feature item is actionable.
