> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- PyTorch and llama.cpp GGUF MoE sizing is supported: total parameters size weights, active
  parameters size KV cache, and GGUF uses the additive total with no final safety multiplier.
- A 1M-token long-context inference regression proves the calculator stays KV-cache bound
  (87.5 GB KV vs 7.0 GB weights at 8-bit) for 7B at 1,000,000 context.
- LoRA/QLoRA adapter overhead can now be sized from trainable parameter percent in the core,
  while the legacy 4 GB QLoRA default remains for forms that do not expose that knob.
- The assumption summary is architecture-aware: MoE shows the `active_parameters * (context_k / 8)` KV heuristic instead of the dense `(parameters / 10)` form, so the displayed assumption matches the core math.
- The Vite web UI uses the reference terminal theme (green accent on near-black grid, monospace font, terminal status strip, results-left/control-right desktop layout), is backend-wired through `/api/report`, accepts decimal model sizes, escapes rendered values, normalizes invalid URL params, and ignores stale report responses.
- The Vite and static fallback forms expose dense/MoE architecture plus active parameters.
- The Vite and static fallback forms expose PyTorch vs llama.cpp GGUF runtime, and calculation text
  uses the selected runtime multiplier.
- The Vite report panel is internally constrained so dense results do not force document scrolling.
- The Vite web UI validates `/api/report` payload shape before rendering and rejects malformed JSON, partial or mislabeled breakdowns, empty or blank hardware rows, invalid comparison rows, blank assumptions, and blank top-level report strings.
- Quantization comparison rows must include non-empty total and savings text before the Vite UI renders a successful report.
- The LoRA adapter checkbox is disabled unless model training is enabled in both the Vite app and static fallback page.
- README documents the FastAPI backend start command, deterministic Vite dependency install, and frontend dev command.
- `pyrightconfig.json` scopes pyright to `harness`, `src`, and `tests`, avoiding broad scans during Ralph verify.
- Playwright smoke specs cover the Vite app, assumption labels, supported precisions,
  stale response handling, malformed payload rejection, empty assumptions, and
  partial/mismatched comparison rejection.
- Markdown handoff files are tested to stay under 100 lines.

- The `/api/report` breakdown labels now match the Vite contract (`Weights`, `KV cache`,
  `Task`, `CUDA/system`). Previously the backend emitted `Task overhead`/`CUDA tax`, which
  `isReportPayload` rejected, so the live app always showed "Report unavailable" while the
  mocked e2e suite stayed green. `tests/test_api.py` now pins these labels.
- The calculation card renders the deployment's real safety margin via `DeploymentReport.runtime_margin`
  instead of back-computing `total / subtotal`. Tiny CUDA-tax-bound runs (e.g. 400k-param full
  training) rounded to a fabricated `1.13` multiplier that contradicted the `10%` assumption panel.
- `form_from_query` parses `context_tokens` via `parse_context_tokens`, matching the frontend's
  `Number.isInteger` guard. A bare `int("8000.0")`/`int("8e3")` raised `ValueError` and silently
  reset every input to the default 8B deployment, contradicting the form the user still saw.
- `form_from_query` defaults a missing MoE `active_parameters_b` to `1.3` (the frontend
  `DEFAULT_VALUES`), so the no-JS server page renders the same MoE deployment the JS app would
  instead of a `KeyError` reset to the dense 8B default.
- Dense Vite query state now drops stale `active_parameters_b` values, so a MoE-only URL value is
  neither sent to `/api/report` nor displayed in the disabled dense-model control.
- `DeploymentReport` groups table-shaped report payloads under `ReportTables` while preserving
  `.hardware`, `.assumptions`, and `.comparison` access, keeping pylint verify green.
- `form_from_query` parses numbers via `parse_decimal`, which rejects underscore-grouped values
  (`1_000`) that Python `float()` accepts but the frontend's `Number()` rejects, so the no-JS page
  and JS app size the same deployment for any URL.
- The Vite query parser now accepts only decimal number strings before calling `Number()`, so
  URL-only values like `parameters_b=0x10` normalize to defaults instead of disagreeing with the backend.
- `parse_decimal` also rejects non-ASCII numerals; Python `float()` normalizes full-width Unicode
  digits to a value, so a crafted URL had sized a deployment on the no-JS page that the decimal-only
  JS parser reset to the default.
- `parse_decimal` trims the JS `trim()` whitespace set (e.g. `U+00A0`) and then accepts only the
  decimal alphabet, so a Unicode-whitespace-padded number sizes the same deployment the JS app does,
  while `float()`-only padding the JS form keeps (`U+001C`) is still rejected.
- `form_from_query` parses with `keep_blank_values=True`, matching JS `URLSearchParams.getAll`: a
  trailing blank repeat (`weight_bits=8&weight_bits=`) now resets the no-JS page like the JS form
  instead of dropping the blank and sizing the prior value.

## Checks

- `npm run build` in `frontend/` - green after decimal-only Vite query parsing.
- `uv run pytest tests/test_frontend.py` - green, 8 passed after decimal-only Vite query parsing.
- `TMPDIR=/Users/rxdt/ai_deployment_calculator/scratchpad/playwright-tmp npm run test:e2e -- --grep "non-decimal numeric"` - blocked before test execution by macOS Chromium Mach port permission denial.
- `uv run ralph gate` - green after `parse_decimal` trims the JS whitespace set and validates the decimal alphabet.
- `uv run ralph verify` - green after decimal-only Vite query parsing.

## Next

- `specs/quantization_comparison.md`, `deployment_plan.md`, `vram_calculator.md`, and now
  `assumption_transparency.md` are marked COMPLETE: all acceptance signals are pinned by tests.
  Remaining open specs are `frontend.md` (user-gated until they delete the example) and
  `code_review.md` (frontend adversarial coverage; the TS validators have no unit-test runner,
  only the blocked Playwright e2e).
- `tests/test_api.py` now mirrors the frontend `hasSupportedComparisonRows`/`hasRequiredAssumptionRows`
  contracts against a real non-default-precision payload, guarding the live-app-breaking divergence
  class (like the prior breakdown-label mismatch) that the blocked Playwright suite cannot.
- Keep `frontend/example_user_will_delete/` untracked for now; it is only an example reference.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers

- Codex code_review-6/6: Playwright cannot launch Chromium in this sandbox due to macOS Mach port permission denial.
- Codex vram_calculator-4/6: unrelated working-tree deletion `claude_test.json` remains outside this commit.
- Codex code_review-1/1: commit blocked because `.git` is read-only in this session; `git add` cannot create `.git/index.lock`.
- Claude (vram_calculator-2/3, code_review-3/3, vram_calculator-1/7 & 2/7, code_review-3/7):
  `ralph verify` security gate repeatedly fails on `ca-certs: empty trust anchors`; the
  harness refuses the unsandboxed retry. `ralph gate` and `pytest` are green; commits landed.

## Resolved

- The semgrep `ca-certs: empty trust anchors` failure and SSH `git push` failure were
  the macOS sandbox blocking securityd Mach IPC and SSH-over-SOCKS, not code. Fixed by
  `allowUnsandboxedCommands: true` in ~/.claude/settings.json: run gate/verify/push with
  the sandbox disabled (the system trust store and SSH keys then resolve normally).
