> Handoff. Keep it short and current.

## State (2026-07-15)

- **Committed this iteration (prior-run leftovers, verified green):**
  - `5671d28` F8 MI300X 192 GB card + GPU_LINKS page; Phase 2 spec sync
    (F4 marked done, F8 contract, loop-discipline section).
  - `6a12431` share-URL serialization tidy (`wireValue`) that omits
    seed-default values so links stay short.
- **F6 was implemented and verified green, then reverted — it cannot be
  committed (see Blockers).** The implementation was: optional
  `costPerHourUsd` on `GpuCard`; dated 2026-07 indicative rates on
  A100/H100/H200/B200/MI300X; a muted "~$X.XX/hr rented" caption appended in
  `gpuExampleNodes` (`app-dom.ts`); the anti-pricing report test retargeted at
  prose fields; a render test + per-card-rate test. It passed
  `test:coverage` (273 tests, 100% branches) and `preflight`, but the commit
  hook rejected it.
- Prior shipped: F3 real quant ladder, F4 crawlable prose/FAQ/keyword flip.
- Branch: `main`, ahead of `origin/main`. `UPSTREAM.md` remains untracked.

## Checks

- Passed (F6 working tree, before revert): `pnpm --dir frontend run
  test:coverage` — 273 tests, 100% statements/branches/functions/lines;
  `pnpm preflight`.
- The F6 commit was **rejected by the harness gate** (see Blockers).

## Blockers

- **HARNESS TRAP blocks F6 and any `app-dom.ts` / `app.ts` change.** The
  `preferenceProblems` gate (`harness/gate.ts` → `harness/preferences.ts`)
  scans the full staged content of every `.ts` file in a commit and rejects
  DOM selectors not in `ALLOWED_TS_DOM_DATA_SELECTORS`. That allowlist is
  missing `[data-tier-fit]`, used by the pre-existing `renderTierFits` in
  `app-dom.ts`, so staging `app-dom.ts` fails with
  `unlisted data-* selector '[data-tier-fit]'`. `app.ts` is likewise frozen:
  its `hideSlots` calls `querySelectorAll(selector)` with a variable, which
  the same gate flags as a dynamic selector. `app-dom.ts` was last committed
  in `549d433`; no commit since has touched it, so this latent trap was never
  hit until F6. **Fix is owner-only** (forbidden `harness/` path): add
  `"[data-tier-fit]"` to `ALLOWED_TS_DOM_DATA_SELECTORS` and either allowlist
  the `hideSlots` pattern or exempt variable selectors. After that, F6 is a
  ~15-minute redo from the description above. Logged in `UPSTREAM.md`.
- **F1 (HF model lookup) is too large for one gate-green iteration.** It needs,
  in one atomic commit under the 100% branch gate: a typeahead UI in a frozen
  `app.ts`, a mocked fetch layer (quicksearch + config.json + safetensors
  index), new resolved-architecture state fields, real `num_key_value_heads`
  feeding the KV math (`calculator-core.ts` hardcodes GQA kvHeads=8 in
  `ARCHITECTURE_BUCKETS`), URL state storing resolved numbers, and fetch-mock
  tests + a manual-fallback e2e. It is also gated by the same harness trap
  (touches `app.ts`). Split into sub-PRs: (1) resolved-arch state + calculator
  KV override + tests; (2) pure HF fetch/parse module + tests; (3) typeahead
  UI + e2e.
- **F5 (prerendered per-model pages) is blocked by the forbidden-path rule:**
  its contract requires adding rollup inputs in `harness/vite.config.ts`, and
  `harness/` may not be edited by the loop.

## Next

- Owner: fix the harness selector allowlist (see Blockers) to unfreeze
  `app-dom.ts` / `app.ts`; nearly all remaining Phase 2 UI work depends on it.
- Once unfrozen, F6 is the fastest win, then F1 (per the sub-PR split), then F2.
- F8 is a recurring data-only refresh and stays committable independently.
