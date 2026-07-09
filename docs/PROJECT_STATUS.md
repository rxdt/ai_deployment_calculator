> Handoff. Keep it short and current.

## State

- Current branch: `main`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Default output contract: hero glance first, four collapsed result detail
  panels, no `Accuracy` or `Your GPU Fit`, and default inference warnings
  hidden.
- The form has one visible action: submit button `Reset`; submit prevents
  navigation, zeroes inputs, and renders the empty estimate.
- Hidden adaptive controls disable descendants; hidden MoE selection is cleared
  before returning to MoE-applicable families.
- Expanded `Advanced assumptions` now opens as a compact anchored panel, and
  Playwright pins no page overflow on desktop/mobile viewports.
- `specs/frontend.md` marks the expanded advanced one-viewport contract and
  Playwright coverage complete.
- Result detail speed labels now include the rendered workload unit, e.g.
  `Estimated Speed (tokens/sec)`, `images/min`, `clips/min`, `rows/sec`, or
  `audio tokens/sec`.
- Secondary result math and formula outputs stay hidden by default and are
  visible only after their detail panels expand.
- Public UI labels/options are pinned to the Naming Contract in real HTML app
  unit coverage.
- Responsive CSS now constrains media, topbar/layout children, hero values,
  labels, and result metrics so long text reflows instead of causing horizontal
  page overflow.
- Playwright responsive coverage now asserts edge content stays in viewport for
  default, long workload-name, and expanded advanced-assumptions states.
- Report assumptions now show advanced inputs that affect estimates: known file
  size, GPU resident fraction, LoRA trainable percent, optimizer, gradient
  checkpointing, and memory sharding.
- Decoder KV assumptions now show the scaling inputs engineers need to audit
  the KV term: context/output/text-image inputs, concurrency, precision, and
  resolved KV head counts.
- GPU resident fraction is clamped to a maximum of `1` before it scales
  known-file resident weight memory.
- `specs/plan.md` marks the workload-adaptive speed label complete.
- `specs/frontend.md` marks the Naming Contract public UI names complete.
- `specs/frontend.md` marks the responsive contract complete.
- `Known Model File Size` now overrides QLoRA base model memory, matching the
  documented resident-file-size override contract.

## Commands

- Focused app/report unit tests:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
- Focused calculator unit tests:
  `pnpm --dir frontend exec vitest run src/calculator.test.ts`
- Full unit + coverage: `pnpm --prefix frontend run test:coverage`
- Build: `pnpm --prefix frontend run build`
- Preview: `pnpm --prefix frontend run preview -- --port 5174`
- Playwright:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Focused responsive Playwright:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js frontend/tests/responsive.spec.ts`
- Lighthouse:
  `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`
- Preflight: `pnpm preflight`
- Gate: `pnpm gate`

## Checks

- Focused units pass via harness Vitest:
  `./harness/node_modules/.bin/vitest run --config harness/vitest.config.js frontend/src/app.test.ts frontend/src/calculator.test.ts frontend/src/report.test.ts`
  (`127` tests).
- Full frontend unit sweep via harness Vitest runs `153` tests, then fails on
  missing `fast-check` for `frontend/src/calculator.property.test.ts`.
- Source lint passes for changed source:
  `./harness/node_modules/.bin/eslint frontend/src/report.ts --config harness/eslint.config.js --max-warnings=0`.
- Latest `pnpm preflight` passes format/style/html but fails eslint because the
  current frontend install cannot resolve `vitest` types in `frontend/src/*.test.ts`.
- Final `pnpm gate` passed format, style, html, schema, cruise, deadcode,
  spelling, workflow, sast, secrets, audit, build, and Lighthouse; it failed
  eslint/typecheck/coverage/e2e on the blockers below.
- Commit attempt failed in the pre-commit preflight on unresolved Vitest types
  in `frontend/src/report.test.ts` plus forbidden `harness/cli.ts`.

## Blockers

- No current frontend behavior blocker.
- Existing unstaged forbidden edits remain in `harness/cli.ts` and
  `harness/cli.test.ts`; `harness/cli.ts:142` fails eslint
  `unicorn/max-nested-calls`, and agents must not stage or alter harness files.
- Forbidden `harness/logging.ts` currently fails Prettier, eslint
  `unicorn/no-array-reduce`, callback-reference, and max-lines checks.
- Frontend-local package bins are absent in this install: `pnpm --dir frontend
  exec vitest ...` and direct `pnpm --prefix frontend run build` fail on missing
  `vitest`/`vite`; full harness Vitest also lacks `fast-check`.
- `pnpm gate` e2e fails because `@playwright/test` and `@axe-core/playwright`
  cannot be resolved from `frontend/tests/*.spec.ts`.
- `pnpm install --frozen-lockfile` reports the workspace is already up to date
  but does not restore frontend-local `.bin` links.
- Existing unstaged forbidden edits remain in `PROMPT.md`; agents must not stage
  or alter them.
