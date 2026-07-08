> Handoff. Keep it short and current.

## State

- Current branch: `harness-setup-config-overrides`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- `frontend/src/styles.css` holds the compact dark responsive styling pass built
  on stylelint-approved design tokens.
- Header brand is `~VRAM-calculator` text, not a link; GitHub remains a labeled
  repository link with the local logo asset.
- Default collapsed outputs fit the tested desktop and mobile viewports with four
  compact result detail panels.
- Output contract is unit-pinned: hero glance first, `Why this recommendation`,
  `Calculation used`, `Formula used`, and `Assumptions used` details collapsed,
  overflow fit fields `n/a`, and no `Accuracy` / `Your GPU Fit` output.
- `Formula used` shows labeled canonical terms: `Required_GB`, `Weights_GB`,
  `Working_Memory_GB`, `Training_State_GB`, `Runtime_Overhead_GB`, `Buffer`, and
  `Safety_Buffer_GB`.
- Expanded result detail headings use cyan; collapsed headings do not.
- Default inference renders no warnings; training, MoE, and sharded-tier guidance
  remain conditional.
- A small disclaimer is rendered below the app outputs.
- `Parameter Unit` exposes only the canonical `B` and `M` choices in the real
  HTML form.

## Commands

- Full unit + coverage: `pnpm --prefix frontend run test:coverage`
- Single suite: `pnpm --prefix frontend run test:file src/<name>.test.ts`
- Build: `pnpm --prefix frontend run build`
- Preview: `pnpm --prefix frontend run preview -- --port 5174`
- Playwright direct:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Lighthouse direct:
  `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`
- Preflight: `pnpm preflight`
- Gate: `pnpm gate`

## Checks

_Verified 2026-07-07 on this branch._

- `pnpm --prefix frontend run test:coverage` passes: 128 tests, 100% coverage
  (statements/branches/functions/lines).
- `src/report.test.ts` passes: 16 tests. `src/app.test.ts` passes: 37 tests.
- `pnpm --prefix frontend run build` passes: `index-*.js` 54.55 kB (gzip 16.72
  kB), `index-*.css` 11.64 kB (gzip 2.66 kB); within the size-limit budgets.
- `pnpm preflight` passes: 0 issues (format, eslint, style, html).
- `pnpm gate` passes: 0 issues. All steps status=0, including coverage, e2e
  (Playwright), and Lighthouse. `semgrep` (sast) is SKIPPED — not installed on
  this machine.

## Blockers

-
