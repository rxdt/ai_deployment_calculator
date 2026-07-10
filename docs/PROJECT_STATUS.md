> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `a411372`.
- Iteration 2/3 scope: make the frontend keep its compact two-pane calculator
  shell inside the viewport for the collapsed and fully expanded disclosure
  states.
- Fix: `frontend/src/styles.css` now gives the app a fixed viewport shell,
  contains result overflow inside the results pane, keeps the desktop two-pane
  layout, and renders the narrow advanced assumptions panel as a viewport
  overlay so its controls stay reachable.
- Test: `frontend/tests/responsive.spec.ts` now asserts the document itself has
  no vertical overflow for collapsed defaults and for all disclosures expanded.
- Spec: `specs/frontend.md` marks the page-scroll and desktop two-pane contract
  complete.
- Commit: this iteration commit.

## Checks

- `pnpm --dir frontend test:e2e -- tests/responsive.spec.ts`: PASS.
- `pnpm preflight`: PASS.
- `pnpm gate`: PASS.

## Blockers

- The top `specs/frontend.md` item (import `VRAM Calculator.dc.html` via the
  claude_design MCP at `https://api.anthropic.com/v1/design/mcp`, auth via
  `/design-login`) cannot be actioned in this non-interactive run: that MCP
  server is not connected and its OAuth flow cannot run headless.
- Remaining visual polish still needs a pass against `docs/odoo.html`,
  `specs/dispel.html`, and `specs/groundcover.html`; this iteration stayed on
  the shippability-critical viewport contract.

## Next

- Continue the final visual pass without changing calculator behavior.
