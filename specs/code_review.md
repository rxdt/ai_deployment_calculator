## Vision

The code in this project is human-readable, cleanly structured, free of bugs not caught by tests, and runs as expected always. A code reviewer looks for both small bugs and big meta-bugs. The code reviewer does not write code. It creates a checklist below. Each checklist item is an issue that must be fixed. Each checklist item has an equivalet test/s.

Do not add tests simply to say you added tests. Write tests because you have verified that there is an issue with the application that needs to be addressed. Tests are how you communicate about and highlight a problem.

## Current State

Frontend review has started. Regression coverage now includes stale adapter state,
the `/api/report` JSON contract, and Vite query normalization. Invalid URL params
such as `weight_bits=99` or `parameters_b=0` are normalized before the Vite form is
rendered or `/api/report` is fetched, matching the backend fallback behavior. The
Vite app ignores stale `/api/report` responses when users submit newer inputs
before an earlier request finishes. The backend query parser now also drops
`use_adapter=on` unless `trained` is checked, matching the Vite and static form
state. The Vite app validates report JSON before rendering so malformed payloads
fall back to the existing error state instead of producing misleading UI,
including partial VRAM breakdown payloads that cannot support the result view.
Empty hardware recommendation payloads are rejected before rendering, so the
frontend cannot show an apparently successful report with no deployable option.
Partial quantization-comparison payloads are also rejected before rendering, so
the frontend cannot silently show fewer than the four supported precision totals.
Comparison payloads with multiple selected precision rows are rejected too, so
the highlighted selected precision remains unambiguous. The selected comparison
row must also match the submitted weight precision, the payload must contain
the four supported precision labels, and comparison total/savings values must be
non-empty. Assumption summaries must contain the five required audit labels and
non-empty values, so stale or blank audit payloads are rejected before rendering.
Top-level report totals, plan text, and calculation strings must also be
non-empty before the frontend renders success. Hardware recommendation rows must
contain non-empty name, detail, and sharding text. Dense query state drops stale
MoE-only active parameter values before rendering the disabled input. Vite query
normalization rejects URL-only numeric forms such as `0x10`, matching the backend
decimal parser instead of sending a report request the backend will default.

## Prioritize These Items

- [ ] Tests are challenging to the source code.
- [ ] Tests truly push at brittle code, weak assumptions, bad logic, and stale statements.
- [ ] The frontend has been code reviewed. Adversarial tests have been written.
- [ ] The frontend has been code reviewed. Adversarial tests have been written against it.
- [x] Stale frontend report responses cannot overwrite the latest submitted inputs.
- [x] Vite form display diverges from the normalized report on invalid URL params.
- [x] `/api/report` JSON contract is pinned against the frontend `ReportPayload`.
- [x] Static fallback clears adapter state when training is disabled.
- [x] Backend query parsing clears adapter state when training is absent.
- [x] Frontend manifest test matches the current Vite dependency.
- [x] Malformed `/api/report` payloads are rejected before frontend rendering.
- [x] Partial frontend breakdown payloads are rejected before rendering.
- [x] Empty frontend hardware recommendations are rejected before rendering.
- [x] Partial frontend quantization comparisons are rejected before rendering.
- [x] Ambiguous selected frontend quantization comparisons are rejected before rendering.
- [x] Mismatched frontend quantization selected rows are rejected before rendering.
- [x] Mismatched frontend assumption labels are rejected before rendering.
- [x] Blank frontend assumption values are rejected before rendering.
- [x] Mismatched frontend breakdown labels are rejected before rendering.
- [x] Blank top-level frontend report strings are rejected before rendering.
- [x] Blank frontend hardware recommendation text is rejected before rendering.
- [x] Blank frontend quantization comparison values are rejected before rendering.
- [x] Backend `/api/report` breakdown labels match the frontend `REQUIRED_BREAKDOWN_LABELS` contract.
- [x] Non-finite `parameters_b`/`active_parameters_b` are rejected in the form layer, matching the frontend's `Number.isFinite` guard (inf crashed hardware sizing; nan produced nonsense totals).
- [x] The calculation card renders the deployment's real safety margin, not a value back-computed from the rounded total (tiny CUDA-tax-bound runs showed a fabricated `1.13` that contradicted the `10%` assumption).
- [x] The quantization comparison preserves the deployment's runtime, so GGUF rows keep the additive `1.0` margin instead of silently inflating by the `1.10` PyTorch multiplier.
- [x] Integer-valued context tokens (`8000.0`, `8e3`) parse like the frontend's `Number.isInteger` guard, so the backend stops silently dropping every input back to the default deployment.
- [x] A missing MoE `active_parameters_b` defaults to the frontend's `1.3`, so the no-JS server page renders the same MoE deployment as the JS app instead of resetting to the dense 8B default.
- [x] Dense frontend query state drops stale `active_parameters_b`, so a MoE-only URL value is neither sent to `/api/report` nor displayed in the disabled dense-model control.
- [x] Underscore-grouped numbers (`1_000`) are rejected like the frontend's `Number()`, so the no-JS server page stops sizing a different deployment than the JS app for the same URL.
- [x] Non-ASCII numerals (full-width Unicode digits) are rejected like the frontend's `Number()`; Python `float()` normalizes them to a value, so a crafted URL sized a different deployment on the no-JS page than the JS app reset to default.
- [x] Hex-like Vite query numbers (`0x10`) are rejected before `/api/report`, so the JS app matches the backend decimal parser.
- [x] A non-default-precision `/api/report` payload satisfies the frontend `hasSupportedComparisonRows`/`hasRequiredAssumptionRows` contracts (selected row matches submitted precision; the four precision and five assumption labels are present), guarding the live-app-breaking divergence class the sandbox-blocked Playwright suite cannot.

## Acceptance Signals

The app works reliably 99.9% of the time.

## Non-goals

## Blockers
-
-

## COMPLETE ?

- [ ] TRUE
- [ ] FALSE
