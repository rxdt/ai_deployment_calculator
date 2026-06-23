PRIORITY 1 (implemented)

## Vision

Create a one page, no scroll web app that takes user input about their model and tells them what size GPUs they need. Make the calculations optionally visible with result so an AI engineer can audit the estimate. The app will start out looking like a simple inputs and checkmarks form. At the end it should look dark themed with color like [this webpage screenshot](src/web/examples_sites/model_recommendation.png). With functionality like [this web calculator screenshot](src/web/examples_sites/water_calculator.png).

## Current State

The stdlib WSGI web app renders a one-page calculator with dark theme styling,
all required inputs, backend-driven results, hardware recommendations, host RAM,
quantization comparison, compact assumption disclosure, and tiny sub-0.1B model
inputs supported by the core calculator.

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

- [ ] PRIORITY 1: Web page works as expected for all input and output fields.
- [ ] PRIORITY 2: Playwright has been run with app when a browser harness is available.
- [ ] PRIORITY 3: Frontend is wired correctly to backend.
- [ ] PRIORITY 4: Web app is user friendly.

## Non-goals
