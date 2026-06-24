> Current truth of the repo. Keep it short and current. Human-agent interface point.

## Current State

- Specs are implemented through deployment plan and assumption transparency.
- 32-bit weight and KV precision are supported in the core, comparison, and web form.
- PyTorch MoE sizing is supported: total parameters size weights and active parameters size KV cache.
- The assumption summary is architecture-aware: MoE shows the `active_parameters * (context_k / 8)` KV heuristic instead of the dense `(parameters / 10)` form, so the displayed assumption matches the core math.
- The Vite web UI is dark themed, backend-wired through `/api/report`, accepts decimal model sizes, escapes rendered values, normalizes invalid URL params, and ignores stale report responses.
- The Vite and static fallback forms expose dense/MoE architecture plus active parameters.
- The Vite report panel is internally constrained so dense results do not force document scrolling.
- The Vite web UI validates `/api/report` payload shape before rendering and falls back to the error state on malformed or partial breakdown JSON.
- The LoRA adapter checkbox is disabled unless model training is enabled in both the Vite app and static fallback page.
- README documents the FastAPI backend start command, deterministic Vite dependency install, and frontend dev command.
- `pyrightconfig.json` scopes pyright to `harness`, `src`, and `tests`, avoiding broad scans during Ralph verify.
- Playwright smoke specs cover the Vite app, assumption labels, supported precisions, stale response handling, malformed payload rejection, and partial breakdown rejection.
- Markdown handoff files are tested to stay under 100 lines.

## Checks

- `ruff check .` - green.
- `ruff format --check .` - green.
- Focused pytest for VRAM, presenter, page, and frontend manifest tests - green, 76 passed.
- `npm run build` in `frontend/` - green.
- `semgrep scan --config auto --config p/secrets --error` - green.
- `npm run test:e2e` in `frontend/` - green when Chromium is launched outside the macOS sandbox, 8 passed.
- Focused Playwright partial-breakdown regression attempted here; Chromium launch is blocked by this macOS sandbox.
- `uv run pytest tests/test_readme.py` - green.
- `uv run ralph gate` - green.
- `uv run ralph verify` - green.

## Next

- Keep `frontend/example_user_will_delete/` untracked for now; it is only an example reference.
- Hardware catalog complete through B200 (192 GB). No further catalog entries pending.
- Open research questions remain for GGUF MoE offload, CPU selection, and memory-bandwidth-aware recommendations.

## Blockers

- None.
