---

MUST FILL IN LINE 7 AT START THEN "CLEAR" BACK TO BASELINE BEFORE END OF ITERATION

> CLAIMED BY AGENT:

< agent >< iteration >< run > is working on < list tasks in this spec you choose >

MUST FILL IN LINE 7 AT START THEN "CLEAR" BACK TO BASELINE BEFORE END OF ITERATION

---

# QA Spec — External Oracles

Report-only QA proving the MODEL matches reality, not just that code matches
model. Every expected value comes from OUTSIDE our code — competitors,
published anchors, physical invariants — never our own formulas. Run by
sub-agents. Never edits product code; findings become dated Research
Corrections in `specs/plan.md`. Agreement is not truth (anchors beat
consensus); an unexplained disagreement is a lead worth running down.

## Part A — Cross-calculator comparison

Drive competitor calculators with our canonical scenarios; compare per
component; triage every disagreement.

Primary targets (headed Playwright for apxml — Cloudflare):
apxml.com/tools/vram-calculator, vram.asmirnov.xyz,
huggingface.co/spaces/SadP0i/GGUF-Model-VRAM-Calculator. Secondary: spot-check
only if a primary disagrees.

Canonical scenarios (read OUR live numbers at run time — never hardcode; these
post-F0 values are orientation only): 7B fp16 inf 8k ≈ 18.8; 70B fp16 inf 8k ≈
160.8; 70B Q4_K_M (live); 8B QLoRA 2% ≈ 21.2; 7B full-train AdamW ckpt-on ≈
153; SDXL 1024² ≈ 12. (Pre-F0 orientation was 19.0 / 166.2.)

Method: scratch Playwright in `harness/` (deleted after), one polite pass per
target; normalize GiB-printed-as-GB to decimal GB first; compare per component
(totals can agree by offsetting errors).

## Part B — Adversarial oracle suite

Standing red team. Audit existing tests for weaknesses, then write cases whose
assertions cite external calculators, published anchors, or physical
invariants — never our equations. Source-code failures are LEFT RED: a red
oracle test is a bug report with a reproducer.

Lives in `frontend/adversarial/oracle.test.ts` — deliberately OUTSIDE the gate
glob (`frontend/src/*.test.ts`) so red tests never block the gate. Must still
pass eslint/prettier. Run:
`pnpm --dir frontend exec vitest run ../frontend/adversarial --config ../harness/vitest.config.js`

Each run: (1) troll existing tests for implementation-mirroring tautologies,
unjustified pins, untested boundaries, check-one-way tests; (2) write extremes
(0.001B / 99,999,999.9B params, 1M ctx, huge batch, 100% LoRA, fraction 0/1),
contradictions (MoE active > total, QLoRA vs contradictory URL), and
state→URL→state fixpoint attacks; (3) assert invariants EXACTLY; (4) assert
banded oracle values.

Invariants: monotonic (more params / longer ctx / bigger batch never lowers
total); precision ordering fp32 ≥ fp16 ≥ Q8_0 ≥ Q6_K ≥ Q4_K_M ≥ IQ2_XXS;
quantized-twin equality (same model, two precisions → identical KV + activation
rows); QLoRA < LoRA-fp16 < full-training; every normalizer-emittable input
gives finite, non-negative, non-NaN totals; tier capacity ≥ min raw VRAM.

Confirmed datapoint (2026-07-15): `?total-params=2&workload-size=99999999&context-tokens=0`
→ ctx floors to 256 via URL; KV ≈ 2.94 PB is faithful/finite/monotonic (no
overflow/NaN); tier degrades to the honest ">320 GB distributed" message.
Verdict: accurate, no bug. Seed as an oracle invariant case.

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

Only writable surfaces: the oracle suite, the QA report, and plan.md
corrections — never product source, existing tests, other specs, or harness.
Red is a valid end state; don't weaken red tests to "clean up". One dated
report per run under `docs/qa/` (comparison-… or adversarial-…) with the
table, triage, corrections, and a one-paragraph verdict ("no action" is valid).
Reports pass cspell (tool names added via human commit only). Cadence: after
every formula-affecting change, before each distribution push, else as the
recurring chore when no feature item is actionable.
