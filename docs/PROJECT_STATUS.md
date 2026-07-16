> Handoff. Keep it short and current.

## State (2026-07-16)

- F0 activation floor hotfix is implemented on `main` for the final current
  branch commit: decoder-family inference scratch now uses fp16-equivalent
  weights, floors at 0.5 GB, and shows the fp16 compute-precision assumption.
- Crawlable default VRAM reference and FAQ numbers were refreshed from
  `buildReport`; default 7B fp16 is now 18.8 GB and 70B fp16 is 160.8 GB.
- Prior shipped: F3 real quant ladder and F4 crawlable prose/FAQ/keyword flip.
- Existing uncommitted owner/handoff files remain outside this F0 staging set:
  `frontend/src/app-dom.ts`, `frontend/src/app.ts`, `harness/preferences.ts`,
  `harness/qa-*.mjs`, `UPSTREAM.md`, and `specs/qa*.md`.

## Checks

- Passed: `pnpm --dir frontend run test:coverage` — 273 tests, 100% coverage.
- Passed: affected Playwright specs
  (`calculator`, `calculator-parity`, `responsive`) — 310 passed, 8 skipped.
- `pnpm preflight` fails only on forbidden untracked `harness/qa-*.mjs`
  Prettier formatting.
- `pnpm gate` passes lint/type/build/coverage/E2E/Lighthouse for F0, then
  fails on forbidden untracked `harness/qa-*.mjs` format/deadcode and cspell
  fallout from existing human-owned files.
- Commit attempt blocked by the same preflight hook: forbidden untracked
  `harness/qa-*.mjs` files fail Prettier.

## Blockers

- **Harness selector trap still blocks most UI features.** `app-dom.ts` and
  `app.ts` have pre-existing/handoff edits to work around the selector gate,
  and `harness/preferences.ts` is forbidden for loop agents. Owner review is
  still needed before F1/F2/F6 UI work can move safely.
- **Forbidden QA harness files block preflight/gate and likely commit hooks.**
  Untracked `harness/qa-*.mjs` files fail Prettier/deadcode/spelling checks,
  but loop agents may not edit or delete `harness/`.
- **F5 remains blocked by forbidden-path rules.** Its contract requires Vite
  rollup inputs in `harness/vite.config.ts`, which this loop may not edit.
- **F1 remains too large for one safe UI commit while the selector trap is
  unresolved.** Split into state/KV math, HF fetch/parse, then typeahead UI.

## Next

- Owner: clean or remove the untracked `harness/qa-*.mjs` files, then rerun
  `pnpm preflight` and `pnpm gate`.
- Commit only the staged F0 code, tests, static HTML, specs, and this status
  file once the forbidden harness blocker is cleared.
