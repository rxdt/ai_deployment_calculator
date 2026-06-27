# Backend Removal Spec

PRIORITY 1

## Goal

Remove the Python/FastAPI backend path and leave the app as a fully JavaScript/TypeScript Vite calculator.

The backend work is not to preserve `/api/report`. It is to remove backend ownership after TypeScript parity exists.

## Source Of Truth

- `docs/plan.md` owns the calculation contract and product goals.
- `specs/frontend.md` owns the frontend implementation contract and corrected expected outputs.
- This spec owns deletion/migration work for Python, FastAPI, `/api/report`, WSGI, backend tests, backend docs, and backend launch paths.

## Target State

```txt
Vite frontend builds the app.
Frontend TypeScript calculates reports locally.
No frontend source calls /api/report.
No FastAPI/uvicorn/WSGI launch path is documented or required.
No duplicate Python formula logic remains as production code.
Static hosting is enough to run the built app.
```

## Migration Order

1. Confirm the frontend has local TypeScript report generation.
   - `CalculatorApp` normalizes state, calls local `buildReport(state)`, and renders the report.
   - No fetch mock or route intercept is needed for calculator math.
   - Corrected expected outputs come from `specs/frontend.md`, not legacy `/api/report` examples.

2. Remove `/api/report` dependency from frontend tests.
   - Rewrite tests that mock fetch to exercise local state/report functions.
   - Retire browser tests whose only purpose is a real backend API.
   - Keep UI behavior coverage for invalid query normalization, stale controls, escaping, form updates, and rendering.

3. Remove backend launch paths.
   - Delete or retire FastAPI/uvicorn entry points once no tests or docs require them.
   - Remove WSGI leftovers.
   - Remove no-JS FastAPI fallback language; this app is static/Vite-only.

4. Remove Python calculator/report production code after TypeScript parity.
   - Candidate areas: Python server, presenter/view/page/report/calculator modules under `src/`.
   - Keep harness-owned files and harness tests untouched.
   - Do not add backend compatibility shims.

5. Remove or replace backend-only Python tests.
   - Candidate tests: API/server/page/view/presenter/Python calculator tests.
   - Preserve behavior only through frontend/Vitest/Playwright coverage.
   - Do not preserve legacy heuristic examples as correctness tests.

6. Update docs.
   - README should describe Vite-only usage.
   - Specs and project status should say there is no Python/FastAPI backend and no `/api/report`.
   - Remove FastAPI, uvicorn, WSGI, no-build fallback, and `/api/report` instructions.

7. Update CI expectations if assignment permits.
   - Frontend gate is `npm --prefix frontend run gate`.
   - Clean CI needs frontend dependency install and Playwright browsers.
   - Do not edit `.github/`

## Constraints

- Work only inside this repository.
- Do not edit `AGENTS.md`, `harness/`, `tests/harness/`, `.githooks/`, `.github/`, or `pyproject.toml`.
- Do not add backend compatibility shims.
- Do not keep stale docs that imply `/api/report` is a supported runtime path.
- Do not mix legacy heuristic expectations with corrected calculator tests. If old numbers must be preserved, isolate them in a compatibility suite and label them as legacy.

## Acceptance Criteria

```txt
npm --prefix frontend run build passes.
npm --prefix frontend run test:coverage passes.
npm --prefix frontend run test:e2e passes.
npm --prefix frontend run gate passes.
No frontend source calls /api/report.
No production Python/FastAPI calculator path remains.
No WSGI app remains.
README and specs describe Vite-only operation.
Backend-only tests are removed or replaced by frontend tests.
Corrected frontend expected outputs live in specs/frontend.md.
Harness-owned files are untouched.
```

## Non-goals

- Do not change calculator formulas here; formulas live in `docs/plan.md`.
- Do not redesign the frontend here; frontend UI work lives in `specs/frontend.md`.
- Do not edit protected workflow or harness paths unless explicitly assigned.
