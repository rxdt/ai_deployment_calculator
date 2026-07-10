> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `54a3f84`.
- Iteration 1/5 scope: the documented next fit-meter item — turn the hero fit
  meter amber on a tight fit near the recommended-class budget.
- Add: `fitMeter()` in `src/result-format.ts` now returns `isTight` (true at
  >=95% of usable VRAM consumed, i.e. <=5% spare) and, when tight, leads the
  caption with "Tight fit:" so the amber bar never signals by color alone.
  `renderFitMeter()` toggles `.fit-meter--tight`; `.fit-meter--tight` paints the
  value with the new `--color-amber` (`#f97316`, DESIGN.md `amber-accent`).
  The default 7B/24 GB fit sits at 93% and stays green.

## Inherited gate repair

- HEAD `54a3f84` (the presets commit, folded in by the harness) failed
  `pnpm gate`: `chip.className` tripped `unicorn/no-keyword-prefix` and
  `.preset { min-height: 1.75rem }` tripped the stylelint length disallow-list.
  The presets test helper also queried `querySelectorAll("button")`, which the
  harness commit check rejects (non-`data-*` selector). All three were required
  to land any change, so this iteration fixed them: `chip.classList.add`, a
  `--layout-chip-size` token, and reading the chips via `.children`. No behavior
  change; the preset tests still pass.

## Prior iterations

- Presets: one-click chips (Gemma 2B, Llama 8B, 70B, Mixtral) in `src/presets.ts`
  + `buildPresets()`/`applyValues()` in `src/app.ts`.
- Breakdown stat cards (`.breakdown`); hero fit meter (`fitMeter()`).

## Checks

- `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts src/result-format.test.ts --config ../harness/vitest.config.js`: PASS (106).
- `pnpm preflight`: PASS (0 issues).
- `pnpm gate`: see final run in this iteration.

## Blockers

- The claude_design MCP import in `specs/frontend.md` stays blocked: the
  `design` MCP server surfaces tools but is unauthenticated, and `/design-login`
  needs interactive auth unavailable in this run.
- Unstaged `PROMPT.md` edits are forbidden for agents and left for human review.
- No code blocker for the scoped tight-fit-meter work.

## Next

- Named reference gaps (compact status, result rows, fit meter incl. amber,
  breakdown cards, preset chips) are all done. Remaining spec item is the
  general visual pass against `docs/odoo.html`, `specs/dispel.html`,
  `specs/groundcover.html` under `specs/DESIGN.md`; pick only similarly scoped
  gaps that preserve the one-viewport no-scroll contract.
</content>
</invoke>
