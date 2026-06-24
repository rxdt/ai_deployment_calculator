PRIORITY 1 (implemented)

## Vision

Create a one page, no scroll web app that takes user input about their model and tells them what size GPUs they need. Make the calculations optionally visible with result so an AI engineer can audit the estimate. The app will start out looking like a simple inputs and checkmarks form.

It should be styled like [this screenshot](src/web/examples_sites/model_recommendation.png). Code from that screnshot is temporarily at [this directory](frontend/example_user_will_delete). But note our calculator is MUCH simpler in functinoality and features. See inspiration for calculator functinoality and placement of elements at this image - [a light version of calculator](src/web/examples_sites/water_calculator.png). Our webpage and calculator will be dark. Leave `frontend/example_user_will_delete` in repo, do not commit, until frontend is marked complete by the user.

## Current State

The Vite frontend in `frontend/` renders the one-page calculator shell and calls
the backend `/api/report` endpoint for display-ready results from the pure
Python report path. Browser number inputs allow arbitrary positive decimal model
sizes, including the documented `0.0004B` tiny-model case. Rendered query and
report values are escaped before insertion into the Vite DOM. The repo includes
a Playwright smoke harness for the Vite app, including backend failure handling
and the full assumption-transparency label set, including supported precisions;
the LoRA adapter toggle is disabled until training is enabled in both the Vite
app and stdlib fallback page so inference submissions do not carry adapter state.
Invalid URL params are normalized before the Vite form is rendered or the backend
report is fetched. Playwright runs against the Vite app when Chromium is launched
outside this macOS sandbox. README now documents the backend and Vite commands
needed to run the app end to end. The stdlib WSGI app still
serves a static fallback page for simple local viewing. The Vite app validates
report payload shape before rendering and shows the error state on malformed JSON.

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

- [ ] PRIORITY 0: User is able to start and run the Vite frontend and FastAPI backend.
- [ ] PRIORITY 1: Vite page has all required input and output fields including but not limited to MoE, LoRA, and different bit options.
- [x] PRIORITY 2: Playwright has been run with app when browser dependencies are available.
- [ ] PRIORITY 3: App is properly styled like the given examples and elements are properly placed.

## Blockers
-
-

## COMPLETE ?

- [ ] TRUE
- [ ] FALSE
