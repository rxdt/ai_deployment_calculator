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

## 5. Performance

- [ ] [H] Re-run Lighthouse against the deployed URL.

## 7. Docs And Repo Hygiene

- [ ] [L] Add LICENSE if the repo is public.

## 8. Optional Post-Launch

- [ ] [L] Privacy-respecting analytics if usage data is wanted.
- [ ] [L] Error monitoring if client-side production visibility is wanted.
