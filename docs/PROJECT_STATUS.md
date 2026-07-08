> Handoff. Keep it short and current.

## State

- Current branch: `main`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- `frontend/src/styles.css` holds a compact dark responsive styling pass using
  stylelint-approved design tokens.
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
- `Execution Mode` exposes only the canonical `Inference`, `LoRA fine-tuning`,
  `QLoRA fine-tuning`, and `Full training` choices in the real HTML form.

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

_The values below were verified by a prior session on 2026-07-08. The current
iteration could NOT re-run any of them: `pnpm`, `node harness/harness.mjs`, and
the local `vitest`/`vite` binaries are all approval-denied by this session's
permission mode (`node --version` and read-only `git` still work). Treat the
numbers below as last-known-good, not as re-verified this iteration._

- `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
  passes: 54 tests.
- `pnpm --prefix frontend run test:coverage` passes: 129 tests, 100% coverage
  (420 statements, 199 branches, 103 functions, 416 lines).
- `src/report.test.ts` passes: 16 tests. `src/app.test.ts` passes: 38 tests.
- `pnpm --prefix frontend run build` passes: `index-*.js` 54.55 kB (gzip 16.72
  kB), `index-*.css` 4.68 kB (gzip 1.45 kB); within the size-limit budgets.
- `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
  passes: 102 tests.
- `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`
  passes after `pnpm --prefix frontend run build`.
- `pnpm preflight` fails only on forbidden `harness/.markuplintrc.json`
  formatting.
- `pnpm gate` fails on forbidden harness format/typecheck/coverage: formatter
  wants `harness/.markuplintrc.json`; typecheck reports `TS4111` and related
  harness errors; coverage has 6 failing `harness/cli.test.ts` setup tests.
  Frontend build, Playwright e2e, and Lighthouse pass. `semgrep` is skipped.

## Blockers

- **Toolchain denied this session.** `pnpm`, `node harness/harness.mjs ...`, and
  the local `vitest`/`vite` binaries return "requires approval" (including with
  the sandbox disabled), so `pnpm preflight`, `pnpm gate`, unit/coverage, build,
  Playwright, and Lighthouse could not run or be verified this iteration. Only
  read-only shell/`git` and `node --version` are permitted. No frontend source
  was changed blind; unverifiable edits would violate the "pass tests before
  done" rule.
- **Commit blocked.** `.githooks/pre-commit` runs `node harness/harness.mjs
  preflight`, which is denied, so any `git commit` fails at the hook. Prior
  iterations left staged, uncommitted frontend work (`frontend/src/styles.css`,
  `frontend/src/app.test.ts`, `specs/frontend.md`, this file) in the working
  tree; it remains staged and cannot be committed until the toolchain is
  runnable.
- Pre-existing dirty forbidden files are modified in `harness/`; leave them for
  human review and do not include them in frontend commits.
- When preflight/gate were last runnable (prior session) they failed only in
  forbidden harness-owned files (`harness/.markuplintrc.json` format, `TS4111`
  typecheck, `harness/cli.test.ts` coverage), not in frontend code.
