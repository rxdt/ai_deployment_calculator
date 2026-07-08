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

_Last verified by a prior session on 2026-07-08; NOT re-verified this iteration
(1/1). `pnpm`, `node harness/harness.mjs`, and the local `vitest`/`vite` binaries
still return "This command requires approval" in this session's permission mode
(`node --version` and read-only `git` still work). Treat the numbers below as
last-known-good, not as re-verified this iteration._

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
- **`preflight` PASSES (re-verified this iteration via the pre-commit hook).**
  Committing runs `node harness/harness.mjs preflight` as a git child; it
  reported `0 issues` with prettier (incl. `harness/`), eslint, stylelint, and
  html-validate all `status=0`. The earlier "fails on
  `harness/.markuplintrc.json` formatting" claim is stale and false.
- `pnpm gate` could not be re-run directly this session (denied). The pre-commit
  hook runs preflight only, so gate's typecheck (`TS4111`) and coverage
  (`harness/cli.test.ts`) status is unverified this iteration; treat as
  last-known-good. Gate's prettier/format step passed inside preflight.

## Blockers

- **Direct toolchain denied this iteration (verified).** `pnpm --version`,
  `node harness/harness.mjs --help`, and `./frontend/node_modules/.bin/vitest
  --version` each return "This command requires approval" under this session's
  permission mode. So `pnpm gate`, unit tests/coverage (`vitest`), `build`,
  Playwright, and Lighthouse cannot be run or verified here. `preflight` is the
  exception: it runs (and passes) as the git pre-commit child — see Checks. Only
  read-only shell/`git`, `node --version`, and commit-time preflight are usable.
  No source was changed blind; unverifiable behavior edits would violate the
  "pass tests before done" rule.
- **Working tree this iteration.** Only `docs/PROJECT_STATUS.md` (this file) and
  `specs/frontend.md` were dirty. `harness/` and other forbidden paths are clean.
  The earlier claim of leftover staged frontend work (`styles.css`,
  `app.test.ts`) was stale — no such changes are present.
- **`specs/frontend.md` left for human review.** It carries two prior-session
  checklist additions (result cards + light styling "loosely inspired by" the
  inspiration PNGs). Not authored this iteration and not verifiable here, so it
  is left unstaged in the working tree rather than committed.
- **Commit path WORKS (verified this iteration).** `.githooks/pre-commit` runs
  `node harness/harness.mjs preflight` as a git child; the docs-only commit of
  this file succeeded (`preflight passed, 0 issues`). Commits are NOT blocked.
  The prior "commit is blocked / fails at the hook" claim is stale and false.
  Behavior-changing source commits are still gated only by the inability to run
  `vitest`/`gate` locally to prove them first.
- Gate's remaining unverified failure surface (last-known-good, prior session):
  `TS4111` typecheck and `harness/cli.test.ts` coverage in forbidden
  harness-owned files, not frontend code. The `harness/.markuplintrc.json`
  format item is resolved — preflight's prettier step now passes.
