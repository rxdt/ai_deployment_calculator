> Handoff. Keep it short and current.

## State

- Current branch: `main`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Default output contract: hero glance first, four collapsed result detail
  panels, no `Accuracy` or `Your GPU Fit`, and default inference warnings
  hidden.
- The form now has one visible action: submit button `Reset`; there is no hidden
  submit control.
- Submit is the canonical reset path: it prevents navigation, zeroes inputs, and
  renders the empty estimate.
- `specs/frontend.md` marks the single-action UI contract complete.
- Overflow reports now include the sharded-tier speed warning whenever the speed
  estimate falls back to the top sharded tier.
- Speed-estimate tests now pin each workload family's throughput unit
  (`tokens/second`, `images/minute`, `clips/minute`, `rows/second`,
  `audio tokens/second`) and prove MoE active parameters yield a strictly faster
  estimate than the dense equivalent, replacing a loose regex assertion.
- Report tests now pin the confidence label across all ten workload families
  (`Rough` only for image diffusion, video generation, and custom) and pin the
  decoder-KV assumption contract: in inference only text generation,
  encoder-decoder, and vision-language surface `KV Cache precision`; the other
  seven families never do.
- Calculator unit tests now also pin the empty-form 7B server inference total at
  `19.0 GB`, completing the corrected-total checklist in `specs/frontend.md`.
- Calculator unit tests now pin decoder-KV families versus no-KV families and
  exact scaling for encoder, encoder-decoder, diffusion, video, audio, tabular,
  and custom working-memory formulas.
- `specs/frontend.md` marks calculation unit coverage, required commands, and
  the deleted legacy-approximations test as complete.

## Commands

- Focused app/report unit tests:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
- Focused report unit tests:
  `pnpm --dir frontend exec vitest run src/report.test.ts`
- Focused calculator unit tests:
  `pnpm --dir frontend exec vitest run src/calculator.test.ts`
- Full unit + coverage: `pnpm --prefix frontend run test:coverage`
- App typecheck:
  `./harness/node_modules/.bin/tsc -p harness/tsconfig.app.json --noEmit --incremental --tsBuildInfoFile .cache_tsbuildinfo_app`
- Build: `pnpm --prefix frontend run build`
- Preview: `pnpm --prefix frontend run preview -- --port 5174`
- Playwright:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Lighthouse:
  `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`
- Preflight: `pnpm preflight`
- Gate: `pnpm gate`

## Checks

- `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
  passes: 60 tests.
- `pnpm --dir frontend exec vitest run src/report.test.ts` last recorded 16
  tests.
- `pnpm --dir frontend exec vitest run src/calculator.test.ts` passes: 58 tests.
- App typecheck command above passes.
- `pnpm preflight` first failed for unstaged work and test-file formatting; after
  formatting and staging, it passed.
- Final `pnpm preflight` passes.
- Final `pnpm gate` passes format, eslint, style, html, typecheck, harness
  types, schema, dependency-cruiser, deadcode, spelling, workflow lint, secrets,
  audit, build, e2e, and Lighthouse. `semgrep` is not installed and is skipped.
- Final `pnpm gate` fails in forbidden harness coverage tests:
  `harness/cli.test.ts` has six setup cases expecting status `0`, `1`, or `7`
  but receiving status `2`.

## Blockers

- No current frontend behavior blocker.
- `harness/cli.test.ts` is forbidden to agents, so the gate coverage failure
  needs a human harness fix or approval.

## Next

- Continue with the remaining frontend calculation coverage checklist only where
  source or test review shows a real gap.
- Human fix or approve the forbidden harness setup-status failures.
