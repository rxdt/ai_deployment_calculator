> Handoff. Keep it short and current.

## State (2026-07-12)

- Launch-prep pass on top of the completed DC design port. New this pass:
  - **URL state + permalink**: mount hydrates from `location.search`,
    every input `history.replaceState`s the encoded state, and a copy-link
    button copies the shareable URL. Malformed/hand-edited params clamp to
    defaults (e2e-proven, no crash, no markup reflection).
  - **Preset ↔ chrome sync**: the header MODEL word links home by default
    and to the model's page (new tab) while the form still exactly matches a
    loaded preset; the matching preset chip stays green via `aria-pressed`.
    Active preset is derived by state equality (`activePreset`, presets.ts) —
    any edit reverts both.
  - **Hardware tier table**: only the smallest covering tier is checked
    ("Best fit" column) instead of every larger tier.
  - **Fit meter honesty**: the caption and scale row name the usable-VRAM
    budget the bar measures ("Fits on one 24 GB card: 19.0 GB uses 93% of its
    20.4 GB usable VRAM."); tight threshold moved 90% → 95% since the estimate
    already carries the safety buffer and usable-VRAM derate.
  - **Fixes**: WebKit never restyled the fit-scale row via the CSS sibling
    selector (row now hidden directly — real Safari-facing bug); unchecked
    checkboxes were near-invisible (2px border now); Lighthouse
    crawlable-anchors failure (href-less MODEL anchor) resolved by the
    home-default link; assumptions prose now names the full training state
    (master/adapter weights + gradients + optimizer) and attributes gradient
    checkpointing to activations; RTX 5090 links to NVIDIA's official page.
- Presets are variant-agnostic (base vs instruct have identical VRAM math);
  preset URLs are data on `MODEL_PRESETS`.

## Checks (verified 2026-07-12)

- Frontend unit suite: 262+ passing, coverage 100% stmts/branches/funcs/lines
  (gate-enforced).
- Playwright e2e: 288+ passing across desktop-chrome / desktop-safari /
  iphone / pixel / small-320 / tablet (no Firefox project).
- eslint + stylelint + html-validate: 0 problems; typecheck clean.
- Lighthouse CI: all assertions green against the preview build.
- Production console: zero console messages / page errors through load,
  preset click, and input on the built preview.
- Contrast audit (computed from tokens): all text states pass AA (amber 6.0:1,
  cyan 13.2:1, hero green 7.2–8.2:1, muted 5.5:1). Marginal/failing:
  faint disclaimer 4.28:1 (needs 4.5), and non-text UI vs 3:1 — green meter
  fill 2.9:1, red overflow fill 2.5:1, checkbox border 1.9:1.

## Blockers

- Tooling: the repo's pnpm workspace root is the top-level
  `pnpm-workspace.yaml`. A stray generated `harness/pnpm-workspace.yaml`
  (placeholder `allowBuilds`) created a second playwright install and broke
  e2e discovery; it was deleted and the harness `@playwright/test` link
  repointed at the root store. Full cleanup still recommended: remove
  `harness/node_modules` + stale `harness/pnpm-lock.yaml`, reinstall from
  root.
- `frontend/public/404.html` is unwired: copied verbatim to `dist/`
  referencing dev-only `/src/styles.css`, so it deploys unstyled.

## Next

- Launch checklist lives in `docs/LAUNCH_TODO.md` (updated 2026-07-12).
  Open decisions: hosting + deploy CI + base path, canonical URL / OG image,
  LICENSE, analytics. Open verifications: real-device pass, screen reader,
  Lighthouse against the deployed URL.
- No-JS visitors see the static shell with a misleading seed "0.0 GB" total
  and no notice — consider a `<noscript>` banner.
- Contrast follow-ups if desired: lighten `--color-faint` slightly to clear
  4.5:1; consider a brighter checkbox border token to clear the 3:1 non-text
  requirement.
