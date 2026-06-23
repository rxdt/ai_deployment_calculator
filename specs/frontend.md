PRIORITY 1 (implemented)

## Vision

Create a one page, no scroll web app that takes user input about their model and tells them what size GPUs they need. Make the calculations optionally visible with result so an AI engineer can audit the estimate. The app will start out looking like a simple inputs and checkmarks form. At the end it should look dark themed with color like [this webpage screenshot](src/web/examples_sites/model_recommendation.png). With functionality like [this web calculator screenshot](src/web/examples_sites/water_calculator.png).

## Current State

The stdlib WSGI web app renders a one-page calculator with dark theme styling,
all required inputs, backend-driven results, hardware recommendations, host RAM,
quantization comparison, and compact assumption disclosure.

## Prioritize These Items

- Keep the page dark themed while preserving the no-scroll one-page layout.
- Keep the form wired to the pure backend report path.
- Keep tests covering required controls, result fields, and theme tokens.

## Acceptance Signals

- Web page works as expected for all input and output fields.
- Playwright has been run with app when a browser harness is available.
- Lint passes.
- Frontend is wired correctly to backend.
- Best practices for frontend are followed.
- Web app is user friendly.

- [x] PRIORITY 1: one-page backend-wired calculator UI
- [x] PRIORITY 2: required inputs and report outputs
- [x] PRIORITY 3: dark theme styling locked by tests

## Non-goals
