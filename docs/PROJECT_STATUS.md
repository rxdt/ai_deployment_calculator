> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `d6a703d`.
- Iteration scope: make the single-GPU overflow recommendation actionable
  instead of a dead end (calculator trustworthiness, `specs/plan.md` acceptance
  criteria #20/#21), with no layout-contract risk.
- Feature: when a workload overflows every single-GPU tier but a sharded tier
  would fit once sharding is enabled, the "Recommended GPU Class" card now names
  that tier and its GPU count, e.g. "No single-GPU fit. Enable memory sharding to
  fit a 320 GB sharded datacenter class (4x 80 GB GPUs ...), or use offload."
  `describeOverflow` gained an optional `shardedFit` tier; `hardwareRecommendation`
  computes the would-fit sharded tier for the overflow branch. The beyond-table
  (> 320 GB) message is unchanged.
- Prior iteration (still current): concrete "Example GPUs" row in the "Why"
  panel; presentation helpers live in `frontend/src/result-format.ts`; the raw
  claude.ai design bundle lives under git-ignored `scratchpad/`, not `specs/`.

## Checks

- `pnpm --dir frontend test:coverage`: PASS (199 tests, 100% stmts/branch/func/line).
- `pnpm preflight`: PASS (0 issues).
- `pnpm gate`: see the run at the end of this iteration.

## Blockers

- The top `specs/frontend.md` item (import `VRAM Calculator.dc.html` via the
  claude_design MCP at `https://api.anthropic.com/v1/design/mcp`, auth via
  `/design-login`) cannot be actioned in this non-interactive run: that MCP
  server is not connected and its OAuth flow cannot run headless. It needs an
  interactive session to authorize before the import is possible.
- The redesign's marquee additions that grow the input pane (presets row, HUD
  status strip) or add a note to the narrow secondary hero card are effectively
  blocked on the same unresolved mobile owner-decision below: the responsive
  suite asserts the collapsed default fits one 390x844 viewport, and the repo's
  defensive-CSS policy forbids `overflow: hidden`/`clip`, so an unbounded
  wrapping note in the ~60px secondary column risks the no-scroll contract. This
  iteration deliberately placed the GPU examples inside the collapsed, full-width
  "Why" panel to stay clear of that contract.
- Remaining mobile visual work still needs an owner decision: keep the current
  two-pane, one-viewport mobile contract, or allow a stacked mobile layout with
  vertical scroll for readability.
- If the raw design bundle is re-dropped into `specs/` (not `scratchpad/`), it
  will re-break `eslint .` and `html-validate`; the durable fix (a `specs/**`
  globalIgnore) lives in the forbidden `harness/` config.

## Next

- Resolve the mobile no-scroll/readability direction, then bring the presets row
  and HUD status strip over from the design bundle.
