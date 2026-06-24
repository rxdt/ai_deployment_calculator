## Vision

The code in this project is human-readable, cleanly structured, free of bugs not caught by tests, and runs as expected always. A code reviewer looks for both small bugs and big meta-bugs. The code reviewer does not write code. It creates a checklist below. Each checklist item is an issue that must be fixed. Each checklist item has an equivalet test/s.

Do not add tests simply to say you added tests. Write tests because you have verified that there is an issue with the application that needs to be addressed. Tests are how you communicate about and highlight a problem.

## Current State

Frontend review has started. Regression coverage now includes stale adapter state,
the `/api/report` JSON contract, and Vite query normalization. Invalid URL params
such as `weight_bits=99` or `parameters_b=0` are normalized before the Vite form is
rendered or `/api/report` is fetched, matching the backend fallback behavior. The
Vite app ignores stale `/api/report` responses when users submit newer inputs
before an earlier request finishes. The backend query parser now also drops
`use_adapter=on` unless `trained` is checked, matching the Vite and static form
state. The Vite app validates report JSON before rendering so malformed payloads
fall back to the existing error state instead of producing misleading UI.

## Prioritize These Items

- [ ] Tests are challenging to the source code.
- [ ] Tests truly push at brittle code, weak assumptions, bad logic, and stale statements.
- [ ] The frontend has been code reviewed. Adversarial tests have been written.
- [ ] The frontend has been code reviewed. Adversarial tests have been written against it.
- [x] Stale frontend report responses cannot overwrite the latest submitted inputs.
- [x] Vite form display diverges from the normalized report on invalid URL params.
- [x] `/api/report` JSON contract is pinned against the frontend `ReportPayload`.
- [x] Static fallback clears adapter state when training is disabled.
- [x] Backend query parsing clears adapter state when training is absent.
- [x] Frontend manifest test matches the current Vite dependency.
- [x] Malformed `/api/report` payloads are rejected before frontend rendering.

## Acceptance Signals

The app works reliably 99.9% of the time.

## Non-goals

## Blockers
-
-

## COMPLETE ?

- [ ] TRUE
- [ ] FALSE
