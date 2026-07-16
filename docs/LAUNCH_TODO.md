# Launch TODO - VRAM Deployment Calculator

Pre-ship checklist for taking the static Vite calculator public. Ordered by
launch risk. Legend: `[B]` blocker, `[H]` high, `[M]` medium, `[L]` low.

## 0. Ship Blockers

- [ ] [B] Choose hosting. Build output is `frontend/dist`; root-domain hosting
      needs no Vite `base`, subpath hosting does.
- [ ] [B] Add deploy job after the gate once hosting is chosen.
- [ ] [B] Decide production URL/base path, then add canonical/OG URL.
- [ ] [B] Commit, PR, merge to `main`.

## 2. SEO And Metadata

- [ ] [M] Add canonical URL and absolute OG URL after production URL is chosen.

## 4. Responsive And Browsers

- [ ] [H] Real-device matrix: iPhone Safari and Android Chrome.
- [ ] [M] Verify recent mobile fixes on devices: no horizontal scroll at
      320/390px and no <=30em label overlap.
- [ ] [M] Horizontal overflow at <=390px: the top-bar "GitHub" nav link
      (`[data-slot="github-link"]`, `.topnav`) extends ~13px past a 320px
      viewport (right edge 333) and also overflows at 390px. Pre-existing,
      NOT caused by the F4.1 guide relocation (the relocated guide/table do
      not overflow at any tested width). Fix: let the topnav wrap or shrink
      the GitHub chip on narrow viewports.

## 5. Performance

- [ ] [H] Re-run Lighthouse against the deployed URL.

## 7. Docs And Repo Hygiene

- [ ] [L] Add LICENSE if the repo is public.

## 8. Optional Post-Launch

- [ ] [L] Privacy-respecting analytics if usage data is wanted.
- [ ] [L] Error monitoring if client-side production visibility is wanted.
