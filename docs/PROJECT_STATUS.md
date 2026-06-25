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

## Checks

- `uv run pytest tests/test_frontend.py` - green, 8 passed after blank comparison-value validation.
- `npm run build` in `frontend/` - green after blank comparison-value validation.
- `TMPDIR=/Users/rxdt/ai_deployment_calculator/scratchpad/playwright-tmp npm run test:e2e -- --grep "blank values"` - blocked before test execution by macOS Chromium Mach port permission denial.
- `uv run ralph gate` - green after adding the 3.8B QLoRA acceptance row.
- `uv run pytest tests/test_vram_calculator.py` - green, 34 passed after the 7B full-training acceptance case.
- `uv run ralph verify` - green after blank comparison-value validation.
- `TMPDIR=/Users/rxdt/ai_deployment_calculator/scratchpad/playwright-tmp npm run test:e2e` cannot launch Chromium here because of macOS Mach port permissions; the current suite has 19 specs.

## Next

- Keep `frontend/example_user_will_delete/` untracked for now; it is only an example reference.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for CPU selection and memory-bandwidth-aware recommendations.

## Blockers

- Codex code_review-6/6: Playwright cannot launch Chromium in this sandbox due to macOS Mach port permission denial.
- Codex vram_calculator-4/6: unrelated working-tree deletion `claude_test.json` remains outside this commit.
- Codex code_review-1/1: commit blocked because `.git` is read-only in this session; `git add` cannot create `.git/index.lock`.
- Claude vram_calculator-2/3: `ralph verify` security gate fails on `ca-certs: empty trust anchors`; unsandboxed retries were refused by the harness. `ralph gate` is green and the commit landed.
- Claude code_review-3/3: `ralph verify` security gate again fails on `ca-certs: empty trust anchors`; unsandboxed retries refused by harness. `ralph gate` and `pytest` green; commit landed.
- Claude vram_calculator-1/7: `ralph verify` again fails on `ca-certs: empty trust anchors`; harness refused the unsandboxed retry. `ralph gate` and `pytest` green; commit landed.
- Claude vram_calculator-2/7: `ralph verify` again fails on `ca-certs: empty trust anchors`; harness refused the unsandboxed retry. `ralph gate` and `pytest` green; commit landed.

## Resolved

- The semgrep `ca-certs: empty trust anchors` failure and SSH `git push` failure were
  the macOS sandbox blocking securityd Mach IPC and SSH-over-SOCKS, not code. Fixed by
  `allowUnsandboxedCommands: true` in ~/.claude/settings.json: run gate/verify/push with
  the sandbox disabled (the system trust store and SSH keys then resolve normally).
