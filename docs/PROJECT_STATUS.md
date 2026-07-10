> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `b1e7319`.
- Iteration scope: stop the "Recommended GPU Class" hero from misrepresenting a
  sharded tier as a single GPU (calculator trustworthiness, `specs/plan.md`
  acceptance criteria #20/#21), with no layout-contract risk.
- Fix: when the recommended tier is an aggregate sharded tier (e.g. a 62B local
  fit with Memory Sharding on lands on "160 GB sharded datacenter class, e.g.
  2x 80 GB GPUs ..."), the hero card previously collapsed it to "160 GB GPU
  hardware tier", implying a single 160 GB card that does not exist and
  contradicting the multi-GPU "Example GPUs" row. `recommendedGpuClass`
  (`frontend/src/result-format.ts`) now keeps the descriptive "sharded" label
  for aggregate tiers and only collapses genuine single-GPU tiers to
  "N GB GPU hardware tier". Single-GPU heroes and the overflow-guidance card are
  unchanged.
- Prior iterations (still current): actionable single-GPU overflow guidance
  names the would-fit sharded tier; concrete "Example GPUs" row in the "Why"
  panel; presentation helpers live in `frontend/src/result-format.ts`; the raw
  claude.ai design bundle lives under git-ignored `scratchpad/`, not `specs/`.

## Checks

- `pnpm --dir frontend test:coverage`: PASS (200 tests, 100% stmts/branch/func/line).
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
- Follow-up (not blocking): for a sharded fit, the "Why this recommendation"
  panel still reads "a GPU with at least N GB advertised VRAM" / "The next
  common class is 160 GB". That N is the aggregate pool, not one card; consider
  wording it as a sharded pool to match the corrected hero label.
