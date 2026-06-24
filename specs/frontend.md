PRIORITY 1 (implemented)

## Vision

Create a one page, no scroll web app that takes user input about their model and tells them what size GPUs they need. Make the calculations optionally visible with result so an AI engineer can audit the estimate. The app will start out looking like a simple inputs and checkmarks form. At the end it should look dark themed with color like [this webpage screenshot](src/web/examples_sites/model_recommendation.png). With functionality like [this web calculator screenshot](src/web/examples_sites/water_calculator.png).

## Current State

The Vite frontend in `frontend/` renders the one-page calculator shell and calls
the backend `/api/report` endpoint for display-ready results from the pure Python
report path. The stdlib WSGI app still serves a static fallback page for simple
local viewing.

## Prioritize These Items

- Make the frontend Vite.
- Keep the page dark themed while preserving the no-scroll one-page layout.
- Keep the form wired to the pure backend report path.
- Keep tests covering required controls, result fields, and theme tokens.

## Acceptance Signals

- Playwright is run with app.
- Lint passes.
- Best practices for frontend are followed.
- Web app is user friendly.

- [x] PRIORITY 1: Vite page has all required input and output fields.
- [ ] PRIORITY 2: Playwright has been run with app when a browser harness is available.
- [x] PRIORITY 3: Frontend is wired to backend `/api/report`.
- [x] PRIORITY 4: Dark one-page layout is preserved in the Vite CSS.

## Non-goals
