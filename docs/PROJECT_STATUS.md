> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `a411372`.
- Iteration scope: fix the remaining sharded recommendation copy so the "Why
  this recommendation" panel no longer describes aggregate sharded VRAM as one
  GPU card.
- Fix: `whyText` (`frontend/src/result-format.ts`) now says sharded fits need a
  sharded GPU pool with aggregate advertised VRAM and calls the target "the next
  common sharded class." Single-GPU wording stays unchanged.
- Test: `frontend/src/result-format.test.ts` covers both the sharded wording and
  the unchanged single-GPU wording.
- Prior iterations (still current): sharded hero label keeps "sharded";
  single-GPU overflow guidance names the would-fit sharded tier; concrete
  example GPUs render in the "Why" panel; presentation helpers live in
  `frontend/src/result-format.ts`; the raw claude.ai design bundle lives under
  git-ignored `scratchpad/`, not `specs/`.

## Checks

- `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts src/result-format.test.ts --config ../harness/vitest.config.js`: PASS.
- `pnpm preflight`: PASS.
- `pnpm gate`: PASS.

## Blockers

- The top `specs/frontend.md` item (import `VRAM Calculator.dc.html` via the
  claude_design MCP at `https://api.anthropic.com/v1/design/mcp`, auth via
  `/design-login`) cannot be actioned in this non-interactive run: that MCP
  server is not connected and its OAuth flow cannot run headless. It needs an
  interactive session to authorize before the import is possible.
- Remaining mobile visual work still needs an owner decision: keep the current
  two-pane, one-viewport mobile contract, or allow a stacked mobile layout with
  vertical scroll for readability.
- If the raw design bundle is re-dropped into `specs/` (not `scratchpad/`), it
  will re-break `eslint .` and `html-validate`; the durable fix (a `specs/**`
  globalIgnore) lives in the forbidden `harness/` config.

## Next

- Resolve the mobile no-scroll/readability direction, then bring the presets row
  and HUD status strip over from the design bundle.
