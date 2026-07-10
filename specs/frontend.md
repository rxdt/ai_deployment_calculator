# Frontend Spec

## Priority

Ship a compact, trustworthy VRAM calculator today. Preserve naming, calculator correctness, accessibility, and responsive behavior.

## Current Contract

- [ ] Implement this within our ruleset and linting: `scratchpad/professional-calculator-redesign` and `specs/Screenshot 2026-07-09 at 11.23.19 PM.png` and `scratchpad/professional-calculator-redesign/project/screenshots/Screenshot 2026-07-10 at 12.29.26 AM.png`. Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project: https://claude.ai/design/p/b368203b-856d-480e-8103-b1977a6fe1a3?file=VRAM+Calculator.dc.html. Implement: VRAM Calculator.dc.html

The design bundle is a raw claude.ai/design export (`{{ }}` templates, inline
styles, upload `.ts`) and cannot pass `eslint .` or `html-validate`. It lives
under `scratchpad/` (git-ignored, excluded from every linter). Use it as the style/html/javascript to copy from. Our app must look like the screenshot

## Checks

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Required loop checks: `pnpm preflight`, then `pnpm gate` (only run once if you made significant changes, very slow on lighthouse).

## Notes

- The reference files are distilled notes, not raw third-party exports, so the
  repo-wide HTML validator can check them.
