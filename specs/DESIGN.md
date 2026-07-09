---
version: alpha
name: VRAM-calculator
description: Dark technical interface for deterministic AI VRAM GPU calculation.
colors:
  background: "#09090B"
  foreground: "#F8FAFC"
  card: "#111117"
  card-raised: "#16161E"
  popover: "#1A1A22"
  muted: "#18181F"
  muted-foreground: "#71717A"
  secondary: "#A1A1AA"
  border: "#27272A"
  input: "#1C1C24"
  primary: "#22C55E"
  primary-bright: "#4ADE80"
  primary-dim: "#16A34A"
  primary-foreground: "#0A0A0F"
  blue-accent: "#3B82F6"
  cyan-signal: "#67E8F9"
  amber-accent: "#F97316"
  destructive: "#EF4444"
  black-overlay: "#00000099"
  grid-cyan: "#60F7FF"
  logo-purple: "#863BFF"
  logo-purple-deep: "#7E14FF"
  logo-cyan: "#47BFFF"
  logo-lavender: "#EDE6FF"
typography:
  display:
    fontFamily: Geist Variable
    fontSize: 3.75rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0em
  h1:
    fontFamily: Geist Variable
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0em
  h2:
    fontFamily: Geist Variable
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0em
  body:
    fontFamily: Geist Variable
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  hud-label:
    fontFamily: JetBrains Mono
    fontSize: 0.65rem
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.12em
rounded:
  none: 0
  sm: 0.125rem
  md: 0.25rem
  lg: 0.375rem
  xl: 0.5rem
spacing:
  xxs: 0.25rem
  xs: 0.5rem
  sm: 0.75rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  section-y: 2.5rem
  hero-y: 3.5rem
  container: 72rem
  content: 64rem
components:
  nav-bar:
    backgroundColor: "#09090BCC"
    textColor: "{colors.foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.none}"
    height: 3rem
  hud-panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 1.5rem
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: 0.75rem
  primary-button-hover:
    backgroundColor: "{colors.primary-bright}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: 0.75rem
  primary-button-active:
    backgroundColor: "{colors.primary-dim}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: 0.75rem
  secondary-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.secondary}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.sm}"
    padding: 0.5rem
  raised-panel:
    backgroundColor: "{colors.card-raised}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 1.5rem
  popover:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 1rem
  muted-chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.secondary}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.sm}"
    padding: 0.5rem
  muted-text-swatch:
    backgroundColor: "{colors.muted-foreground}"
    textColor: "{colors.foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.sm}"
    size: 3rem
  input-field:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: 0.75rem
  divider:
    backgroundColor: "{colors.border}"
    textColor: "{colors.foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.none}"
    height: 0.0625rem
  recommendation-card-top:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 1.25rem
  recommendation-card-alternate:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 1.25rem
  alternate-badge:
    backgroundColor: "{colors.blue-accent}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.sm}"
    padding: 0.5rem

## Commands

Use `pnpm preflight` before committing and `pnpm gate` for the full gate.
Frontend preview and UI verification commands live in `specs/frontend.md`.
  signal-label:
    backgroundColor: "{colors.card}"
    textColor: "{colors.cyan-signal}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.none}"
    padding: 0.25rem
  warning-note:
    backgroundColor: "{colors.card}"
    textColor: "{colors.amber-accent}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 0.75rem
  error-note:
    backgroundColor: "{colors.card}"
    textColor: "{colors.destructive}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 0.75rem
  grid-swatch:
    backgroundColor: "{colors.grid-cyan}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.none}"
    size: 3rem
  logo-swatch-purple:
    backgroundColor: "{colors.logo-purple}"
    textColor: "{colors.foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.sm}"
    size: 3rem
  logo-swatch-purple-deep:
    backgroundColor: "{colors.logo-purple-deep}"
    textColor: "{colors.foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.sm}"
    size: 3rem
  logo-swatch-cyan:
    backgroundColor: "{colors.logo-cyan}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.sm}"
    size: 3rem
  logo-swatch-lavender:
    backgroundColor: "{colors.logo-lavender}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.sm}"
    size: 3rem
  table:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: 1rem
  code-block:
    backgroundColor: "{colors.black-overlay}"
    textColor: "{colors.foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: 0.75rem
---

> Deferred. Do not implement styling until `specs/frontend.md` and
> `docs/PROJECT_STATUS.md` say JavaScript behavior and HTML wiring are complete
> after a fresh review of `frontend/`.

## Commands

Use `pnpm preflight` for the loop preflight and `pnpm gate` for the full gate.
For visual checks, use the Playwright and Lighthouse commands in `specs/frontend.md`.

# VRAM-calculator

## Overview

A dense, work-focused technical interface for developers deploying AI models. It should feel like a deterministic command center: local, precise, evidence-driven, and compact.

No nav. Grid and scanline textures, compact monospace labels, sparse data tables. Preserve the feeling of an engineering tool that is already running.

## Colors

The palette is dark neutral first, with green as the primary action and system health color. Blue and cyan are secondary signal colors for alternate recommendations, metadata, and workbench readouts. Amber is reserved for warnings and constraints. Red is only for errors.

- **Background (#09090B):** App canvas and page foundation.
- **Card (#111117) and raised surfaces (#16161E):** Panels, recommendation cards, and form surfaces.
- **Border (#27272A):** Primary separator for sections, tables, and panel frames.
- **Primary (#22C55E):** Main call to action, top recommendation, online/running state, and resolved-priority emphasis.
- **Blue accent (#3B82F6):** Alternate recommendation emphasis and secondary evidence highlights.
- **Cyan signal (#67E8F9):** Workbench labels, grid atmosphere, and technical readouts.
- **Amber accent (#F97316):** Validation warnings and gated-access notes.
- **Logo colors:** The public SVG assets include purple, cyan, and lavender values. Use them for brand marks only; do not let the page become purple-dominant.

## Typography

Use **Geist Variable** for interface text and **JetBrains Mono** for code, metadata, table values, terminal labels, install commands, model IDs, and diagnostic copy.

Display text is large and tight, but only in the hero/workbench copy. Secondary panels, cards, tables, buttons, and navigation should use compact type. HUD labels are uppercase, monospace, small, and widely spaced. Do not use negative letter spacing.

## Layout

The layout is mobile-first and constrained. Hero content becomes a two-column workbench on wide screens; on smaller screens it stacks with centered copy and a full-width analysis panel.

Use em-based media queries when a layout change needs a viewport breakpoint. Breakpoints are content-driven, not device-name driven. Do not use px breakpoints.

Use full-width page sections with constrained inner content. Do not place section wrappers inside decorative cards. Cards are reserved for repeated result items, compact panels, deployment steps, and tables. Use flex wrapping aggressively so labels, model IDs, buttons, and platform chips do not overflow.

Spacing is compact: 1rem is the default panel rhythm, 1.5rem is the standard panel padding, and 2.5rem to 3.5rem is enough vertical section spacing.

## Elevation & Depth

Depth comes from borders, tonal layers, subtle blur, grid texture, scanlines, and small colored glows. Avoid heavy shadows. Top cards can use a green glow; alternate cards can use a blue glow. The fake top nav uses a translucent background with backdrop blur.

The background may use a faint cyan grid plus green/blue radial glow, but keep decorative effects low contrast so the calculator remains the focus.

## Shapes

Shapes are squared and utilitarian. The base radius is `0.375rem`, but most visible panels and controls use `0.125rem` to `0.25rem`. Avoid pill-heavy styling except for very small badges or tags already constrained by the UI. Tables, cards, inputs, and buttons should look precise rather than soft.

## Components

**Navigation:** Sticky, dark, border-bottom, compact. Brand text uses monospace `~/VRAM-Calculator`, with green applied only to the prompt marker. The second nav row is a wrapped HUD status strip.

**Workbench panel:** Use a bordered `hud-panel` surface with card background, subtle top highlight, compact form spacing, and no nested cards. The textarea is monospace and resizeable.

**Buttons:** Primary buttons use green fill with near-black text. Secondary actions use transparent backgrounds, borders, and muted text that turns green or foreground on hover. Icon buttons should use lucide icons when available.

**Hero calculation cards:** GPU final calculation is green.

**Tables:** Tables if they exist are bordered, compact, and monospace-heavy. Header rows use muted surfaces and HUD labels. Body rows can use a faint hover tint but should not shift layout.

## Do's and Don'ts

Do keep the interface dense, scannable, and evidence-focused.

Do preserve the green primary action language and blue/cyan secondary signal language.

Do use borders, tables, code blocks, and monospace labels to communicate precision.

Do keep all labels and controls wrapping cleanly on mobile.

Don't build marketing hero cards, decorative card stacks, or oversized editorial sections.

Don't introduce a light theme unless the full token set is redesigned.

Don't make purple the dominant UI color; it belongs to the public logo assets.

Don't hide caveats, cost estimates, or deployment constraints behind decorative UI.
