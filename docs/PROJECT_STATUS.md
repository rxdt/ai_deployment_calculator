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

- No checks could run this iteration: the session permission mode denies every
  code-execution command. `pnpm`, `./harness/node_modules/.bin/vitest`,
  `node -e`, and `node harness/harness.mjs` all return "This command requires
  approval" in this non-interactive session and never execute. `git`, `ls`,
  `cat`, and `find` are allowed, so review is read-only only.
- Verified by inspection that the previously-listed dependency blockers are
  stale: `frontend/node_modules/.bin/{vite,vitest,playwright}`,
  `frontend/node_modules/@playwright/test`,
  `frontend/node_modules/@axe-core/playwright`, `harness/.bin/{vitest,eslint}`,
  and `fast-check` (frontend + harness) are all present.
- `frontend/src/calculator-core.ts` read end-to-end: canonical equation,
  precision map, architecture buckets, runtime presets, weight/QLoRA/file-size
  override, training-state, and training-activation math match `specs/frontend.md`.
  No defect found; no change made because none could be verified.

## Blockers

- PRIMARY: session permission mode denies executing project code
  (`pnpm`/`vitest`/`node -e`/`node harness`), so `pnpm preflight`, `pnpm gate`,
  unit tests, e2e, and build cannot be run and no source change can be validated
  this iteration. Retried the same commands multiple times; consistently denied.
  Prior commits (e.g. `b4cdfae`, `9fefa37`) shipped real source, so this is a
  session-specific regression, not a repo state.
- No current frontend behavior blocker found by read-only review.
- Existing unstaged forbidden edits remain in `harness/cli.test.ts`,
  `harness/gate.test.ts`, `harness/logging.test.ts`, `harness/logging.ts`, and
  `PROMPT.md`; agents must not stage or alter these human-owned files.
