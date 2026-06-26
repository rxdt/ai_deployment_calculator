> PRIORITY remove the Python/FastAPI backend and make this a fully JavaScript/TypeScript Vite app.

## Scope

The app should run, build, and test from frontend only. Do not preserve `/api/report`; calculate the report directly in TypeScript.

## Implementation plan

1. Port the calculator/report logic into TypeScript under `frontend/src/`.
   Suggested modules:
   - `calculator.ts`: VRAM formulas and constants.
   - `hardware.ts`: GPU catalog, host RAM, hardware recommendations.
   - `report.ts`: build the `ReportPayload` directly from `FormState`.
   - Keep existing `types.ts` contract or simplify if validation becomes unnecessary.
2. Change `CalculatorApp.loadReport` so it no longer fetches `/api/report`.
   - Normalize state.
   - Build report locally from state.
   - Render `renderStatusBar() + renderForm(state) + renderResults(report, state)`.
   - Keep stale async request handling only if still needed; otherwise remove it and update tests.
3. Remove or rewrite frontend tests that mock fetch.
   - `frontend/src/app.test.ts` should challenge local calculation/report generation directly.
   - Keep adversarial contract tests, but aim them at local `buildReport` instead of server JSON.
   - Preserve expected examples: default 8B/8000/16-bit result, 70B/8000/4-bit/8-bit training+LoRA result showing `48.4 GB`, `64 GB host RAM`, `A100 80GB`.
4. Remove real-backend browser tests.
   - Delete or retire `frontend/tests/real-api.spec.ts`.
   - Remove `test:e2e:real` from `frontend/package.json`.
   - Remove `frontend/playwright.real-api.config.ts` if no longer used.
   - `frontend` gate should become build + coverage + browser e2e, all static/Vite-only.
5. Update Playwright tests that intercept `/api/report`.
   - Prefer testing actual local calculations instead of route mocks where practical.
   - Keep UI behavior tests for invalid query normalization, stale controls, escaping, and form submission.
6. Remove Python app/backend source and Python tests that only exist for the backend.
   - Ddelete after TS parity exists: `src/` backend/calculator modules.
   - Candidate tests to delete/replace: `tests/test_api.py`, `tests/test_server.py`, `tests/test_page.py`, `tests/test_view.py`, `tests/test_presenter.py`, and Python calculator tests once equivalent Vitest coverage exists.
   - Keep harness tests. Do NOT touch harness tests.
7. Update docs/specs:
   - README should describe a Vite-only app.
   - `specs/frontend.md`, `specs/orchestrate.md`, and `docs/PROJECT_STATUS.md` should say there is no Python/FastAPI backend and no `/api/report`.
   - Remove no-JS fallback/FastAPI launch language.
8. Update CI expectations if allowed by assignment:
   - Frontend command should be `npm --prefix frontend run gate`.
   - Clean CI needs `npm --prefix frontend ci` and Playwright browser install before that.
   - Do not edit `.github/workflows/ci.yml` unless explicitly permitted.

## Constraints

- Work only inside this repo.
- Do not edit AGENTS.md, harness/, tests/harness/, .githooks/, .github/, or pyproject.toml.
- Keep changes surgical and update specs/docs to reflect the new truth.
- Do NOT add backend compatibility shims. The Python backend is going away. Leave the repo as if the Python backend had NEVER existed.
- Preserve calculator behavior, labels, payload shape, and visible UI results unless a test proves the current behavior is obsolete.

The core technical move is: port `report_payload(form_from_query(...))` into a pure TS function and call it from `CalculatorApp` instead of `fetch`.

## Acceptance Criteria

- `npm --prefix frontend run build` passes.
- `npm --prefix frontend run test:coverage` passes.
- `npm --prefix frontend run test:e2e` passes.
- `npm --prefix frontend run gate` passes.
- No frontend source calls `/api/report`.
- No FastAPI/uvicorn launch path remains in README/specs.
- The UI still calculates and renders the known deployment examples locally.

## Out of Scope
(Features/scope the agent must not start.)

- <explicit non-goal>
- <explicit non-goal>
- <fill in additional non-goals as needed>

## Blockers

- <List specific item preventing completion of this spec>

## Changelog

_Keep brief and to the latest items to keep spec < 100 lines_
- Each agent adds their name + iteration info, what the current agent tried, and what worked or did not work
