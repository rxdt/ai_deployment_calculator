## Vision

The code in this project is human-readable, cleanly structured, free of bugs not caught by tests, and runs as expected always. A code reviewer looks for both small bugs and big meta-bugs. The code reviewer does not write code. It creates a checklist below. Each checklist item is an issue that must be fixed. Each checklist item has an equivalet test/s.

Do not add tests simply to say you added tests. Write tests because you have verified that there is an issue with the application that needs to be addressed. Tests are how you communicate about and highlight a problem.

## Current State

Frontend review has started. A regression now covers the static fallback page
clearing stale LoRA adapter query state when training is disabled, matching the
Vite behavior and inference task mapping. A stale Vite dependency assertion was
updated to match the current frontend manifest.

## Prioritize These Items

- [ ] Tests are challenging to the source code.
- [ ] Tests truly push at brittle code, weak assumptions, bad logic, and stale statements.
- [ ] The frontend has been code reviewed. Adversarial tests have been written.
- [ ] The frontend has been code reviewed. Adversarial tests have been written against it.
- [x] Static fallback clears adapter state when training is disabled.
- [x] Frontend manifest test matches the current Vite dependency.

## Acceptance Signals

The app works reliably 99.9% of the time.

## Non-goals
