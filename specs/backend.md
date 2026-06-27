# Backend Removal Spec

PRIORITY 1 - implemented; keep green.

## Current State

- The app is a Vite frontend with browser-local TypeScript report generation.
- `CalculatorApp` normalizes form state, calls `buildReport(state)`, and
  renders synchronously.
- There is no supported report-service route, server-rendered calculator path,
  or duplicate production Python formula source.
- Static hosting is enough to run the built app.
- Backend-only Python calculator, presenter, page, API, and server tests have
  been removed or replaced by Vitest and Playwright coverage.

## Ownership

- `docs/plan.md` owns the calculation contract and product goals.
- `specs/frontend.md` owns the frontend implementation contract and corrected
  expected outputs.
- This spec owns keeping removed backend launch paths, duplicate formula logic,
  backend-only tests, and stale backend documentation from returning.

## Guardrails

- Do not add backend compatibility shims.
- Do not reintroduce duplicate production Python formula logic.
- Do not add docs that imply a server report route is supported at runtime.
- Keep frontend report behavior covered by Vitest and Playwright tests.
- Keep harness-owned files and protected workflow paths untouched.

## Acceptance Criteria

```txt
npm --prefix frontend run build passes.
npm --prefix frontend run test:coverage passes.
npm --prefix frontend run test:e2e passes.
npm --prefix frontend run gate passes.
No frontend source calls a report-service route.
No production Python calculator path remains.
No Python gateway app remains.
README and specs describe Vite-only operation.
Backend-only tests are removed or replaced by frontend tests.
Corrected frontend expected outputs live in specs/frontend.md.
Harness-owned files are untouched.
```

## Non-goals

- Do not change calculator formulas here; formulas live in `docs/plan.md`.
- Do not redesign the frontend here; frontend UI work lives in
  `specs/frontend.md`.
- Do not edit protected workflow or harness paths unless explicitly assigned.
