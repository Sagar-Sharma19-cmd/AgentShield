---
name: AgentShield
description: Runtime security for AI agents. Operator console in the Graphite system.
colors:
  signal-indigo: "oklch(0.5 0.17 268)"
  signal-indigo-dark: "oklch(0.72 0.13 268)"
  cool-paper: "oklch(0.985 0.002 265)"
  white-card: "oklch(1 0 0)"
  graphite-ink: "oklch(0.21 0.015 265)"
  muted-ink: "oklch(0.5 0.015 265)"
  hairline: "oklch(0.915 0.005 265)"
  input-stroke: "oklch(0.88 0.006 265)"
  side-rail: "oklch(0.97 0.003 265)"
  night-graphite: "oklch(0.16 0.008 265)"
  night-card: "oklch(0.195 0.009 265)"
  night-popover: "oklch(0.215 0.01 265)"
  night-rail: "oklch(0.145 0.008 265)"
  moonlight-ink: "oklch(0.96 0.004 265)"
  night-muted-ink: "oklch(0.72 0.012 265)"
  allow-green: "oklch(0.52 0.13 155)"
  allow-green-text: "oklch(0.45 0.12 155)"
  review-amber: "oklch(0.8 0.15 80)"
  review-amber-text: "oklch(0.48 0.11 65)"
  deny-red: "oklch(0.54 0.2 27)"
  deny-red-text: "oklch(0.5 0.19 27)"
  high-orange: "oklch(0.66 0.17 50)"
  high-orange-text: "oklch(0.5 0.14 50)"
typography:
  headline:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: "1.75rem"
    letterSpacing: "-0.01em"
  card-title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: "1.5rem"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  data-mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
    fontFeature: "\"tnum\""
  kpi:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    fontFeature: "\"tnum\""
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  dense: "6px"
  card-sm: "12px"
  card: "16px"
  section: "24px"
  gutter-desktop: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-indigo}"
    textColor: "{colors.cool-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-destructive:
    textColor: "{colors.deny-red}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.white-card}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.white-card}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  badge-allow:
    textColor: "{colors.allow-green-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  badge-review:
    textColor: "{colors.review-amber-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  badge-deny:
    textColor: "{colors.deny-red-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
---

# Design System: AgentShield

## Overview

**Creative North Star: "The Graphite Checkpoint"**

The console is a neutral, graphite-toned checkpoint. Nearly everything an operator sees is quiet: near-neutral surfaces with a faint blue cast, hairline borders and compact type. One indigo accent marks interaction and focus. Saturated colour is reserved for verdicts. When green, amber, orange or red appears, a gate has made a decision, and the colour always arrives with an icon and a label that say the same thing.

The system is dense but readable. It is built for an operator triaging reviews against an expiry clock. Tables beat cards wherever the content is rows. Identifiers, keys, request IDs and scores are set in monospace with tabular figures so they can be compared at a glance. Motion confirms state changes and never decorates. Dark is the primary theme, but light is a complete, independently tuned map, not an inversion. Both are held to the same contrast tests.

The rejected direction is the neon "hacker" console: no glowing text, no vibrant neon accents, no matrix green.

The canonical source of every token is `frontend/src/app/globals.css`, authored in OKLCH. `docs/frontend-design-system.md` holds the full rationale, the page-by-page specs and the contrast evidence.

**Key Characteristics:**
- Graphite neutrals with a faint blue cast (hue 265) in both themes
- A single indigo accent (hue 268) for interaction, focus and active navigation
- Saturated colour only for security state, always paired with an icon and a text label
- Hairline borders and surface steps instead of shadows
- Three typefaces with strict jobs: Inter for UI, Space Grotesk for headings, JetBrains Mono for data
- Short, damped motion (120–320 ms) that respects reduced motion

## Colors

Cool graphite neutrals, one signal indigo, and a four-step verdict ramp (green, amber, orange, red) that appears only when a decision is shown. The frontmatter lists the light-theme values plus the key dark-theme surfaces. Every token has an independent dark value in `globals.css`.

### Primary
- **Signal Indigo** (`signal-indigo`; `signal-indigo-dark` in dark mode): primary buttons, links, the focus ring, the active navigation bar and pill, and the first chart series. It is the only hue that means "you can act here".

### Neutral
- **Cool Paper** (`cool-paper`): the light page background. A faint radial indigo wash (`--glow`) sits behind it at the top right.
- **White Card** (`white-card`): cards, tables and popovers in light mode.
- **Graphite Ink** (`graphite-ink`): body text and headings in light mode.
- **Muted Ink** (`muted-ink`): secondary text, metadata and table captions.
- **Hairline** (`hairline`) and **Input Stroke** (`input-stroke`): the one border colour, and the slightly stronger stroke used for form controls.
- **Side Rail** (`side-rail`): the sidebar surface in light mode.
- **Night Graphite** (`night-graphite`), **Night Card** (`night-card`), **Night Popover** (`night-popover`): the dark-mode page, card and popover steps. Each one is a little lighter than the one below it, and that step is how depth is shown.
- **Night Rail** (`night-rail`): the dark sidebar. It is darker than the page.
- **Moonlight Ink** (`moonlight-ink`) and **Night Muted Ink** (`night-muted-ink`): dark-mode text.

### Security semantics
- **Allow Green** (`allow-green` fill / `allow-green-text`): ALLOW and the LOW risk tier.
- **Review Amber** (`review-amber` fill / `review-amber-text`): REVIEW and the MEDIUM risk tier.
- **High Orange** (`high-orange` fill / `high-orange-text`): the HIGH risk tier only. It keeps HIGH distinct from CRITICAL in tone as well as in icon and label.
- **Deny Red** (`deny-red` fill / `deny-red-text`): DENY, the CRITICAL tier and destructive actions.

Fills are used as tints (10–20%) behind text. The `-text` tones are the only ones used for text.

### Named Rules
**The Verdict-Only Saturation Rule.** Green, amber, orange and red mean a security state, and nothing else. Brand tones (`--brand-*`) are decorative backgrounds only and never signal severity.

**The Never-Alone Rule.** Every decision and risk tier pairs an icon, a label and a tone: CircleCheck "Allowed", Clock "Review required", Ban "Denied"; ShieldCheck, ShieldHalf, ShieldAlert and Flame for LOW to CRITICAL. If the colour were removed, the state must still read correctly.

**The Paired-Theme Rule.** A new colour token gets a light value and a separately tuned dark value, and its text/background pairs are added to the contrast tests (`theme-contrast.test.ts`, `semantic-contrast.test.ts`, minimum 4.5:1).

## Typography

**Display Font:** Space Grotesk (with ui-sans-serif, system-ui)
**Body Font:** Inter (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace)

**Character:** Inter carries the console at small sizes. Space Grotesk adds a slightly technical edge to titles only. JetBrains Mono gives identifiers an unambiguous `0/O` and `1/l/I`. All three fonts are self-hosted variable fonts, so the build works offline.

### Hierarchy
- **Headline** (600, 24px/32px, tight tracking, Space Grotesk): the page title, one per page.
- **Title** (500, 18px/28px, Space Grotesk): sheet and dialog titles.
- **Card title** (500, 16px/24px, Space Grotesk): card and section titles.
- **Body** (400–500, 14px/20px, Inter): body text, table cells and form controls. Prose is capped at 65–75ch.
- **Label** (500, 12px/16px, Inter): labels, badges, metadata and table headers. Uppercase with wide tracking only for tiny eyebrow labels.
- **Data mono** (12–14px, JetBrains Mono, tabular figures): request IDs, API keys, resources, JSON and scores.
- **KPI** (600, 30px/36px, JetBrains Mono, tabular figures): headline numbers on Overview.

### Named Rules
**The Tabular Rule.** Every number that updates or sits in a column uses tabular figures.

**The Heading-Only Grotesk Rule.** Space Grotesk is for h1–h4 only. Body text, tables and controls stay in Inter.

## Layout

Page content sits in a centred container, with the width matched to the job: `max-w-7xl` for table pages (Activity), `max-w-6xl` for Overview, and `max-w-5xl` for forms and registries. The page gutter is 16px on mobile and 32px from `md` up. The spacing rhythm is built on a 4px base: 6px inside dense rows and badges, 16px card padding (12px for small cards), 16px between cards, and 24px between page sections.

The shell is a 240px sidebar that collapses to a 56px icon rail, grouped as Monitor, Respond, Configure and Demo. The header holds breadcrumbs, the ⌘K command palette trigger, the alert indicator and the theme switcher. Master-detail pages (Reviews, Agents) show a list on the left and a sticky detail pane on the right from `lg` up. Below `lg`, the detail opens in a sheet. Activity is a dense table with a sticky header inside its own scroll area from `md` up, and becomes a compact list below `md`. Every page must work at 375, 768, 1024 and 1440px.

### Named Rules
**The Rows-Are-Tables Rule.** Content that is a list of comparable records is a table (or a compact list on mobile), not a grid of cards.

## Elevation & Depth

The system is flat. Depth comes from hairline borders and a stepped surface lightness, not shadow. Level 0 is the page. Level 1 is a card or table: the card surface plus a 1px ring at 10% foreground. Level 2 is a popover, menu or toast: the popover surface, a border and a medium shadow. Level 3 is a dialog or sheet: the popover surface, a border, a large shadow and an overlay. In dark mode, shadows are close to invisible, so the lighter `card` → `popover` step carries the elevation.

### Shadow Vocabulary
- **Overlay** (Tailwind `shadow-md`): dropdowns, popovers and toasts.
- **Modal** (Tailwind `shadow-lg`): dialogs and sheets, always over an overlay.

### Named Rules
**The Flat-At-Rest Rule.** Cards and tables never carry a shadow. Only floating layers do.

**The One-Border Rule.** One border colour (`--border`) everywhere. Never stack borders on adjacent surfaces.

## Shapes

Small, precise radii derived from a single 10px base: 6px for small chips, 8px for badges and compact controls, 10px for buttons and inputs, and 14px for cards. Borders are 1px hairlines. The focus ring is a 2px indigo outline offset by 2px, plus a 3px soft ring on controls. The LogoMark is a shield with filter bars on a tinted primary tile, and it is the only emblem.

## Components

Precise and restrained: compact controls, hairline edges and tonal feedback rather than lift or glow.

### Buttons
- **Shape:** gently rounded (10px), 32px tall by default (28px small, 36px large), with 10px horizontal padding and 14px medium text.
- **Primary:** a Signal Indigo fill with near-white text. On hover the fill drops to 80% opacity.
- **Outline:** a hairline border on the page background. On hover it gets a muted fill.
- **Ghost:** no fill. On hover it gets a muted fill. Used for icon actions and toolbars.
- **Destructive:** a 10% red tint with red text, never a solid red block. On hover the tint rises to 20%.
- **Focus / Press:** the border turns indigo and a 3px indigo ring appears at 50%. On press the button moves down 1px. Disabled buttons sit at 50% opacity.

### Chips
- **Style:** removable filter chips on the Activity page, and gate chips that show a count. A chip whose count is 0 is disabled, not hidden.
- **State:** a selected chip gets a fill plus an icon, so colour is not the only signal.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** the card surface, a step above the page.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** a 1px ring at 10% foreground.
- **Internal Padding:** 16px, or 12px with `size="sm"`.

### Inputs / Fields
- **Style:** 32px tall, a 1px input-stroke border, a transparent background (30% input tint in dark mode) and 10px radius.
- **Focus:** the border turns indigo and a 3px indigo ring appears at 50%.
- **Error / Disabled:** `aria-invalid` turns the border red and adds a red ring. Disabled inputs sit at 50% opacity with a muted fill.

### Navigation
- **Sidebar:** grouped items with 14px Inter labels. The active item gets a pill (spring-animated between items) plus a 3px indigo bar, medium weight and `aria-current`. Hover gets a muted fill. In the collapsed rail, labels are screen-reader only and a tooltip shows them.
- **Mobile:** the same grouped navigation inside a sheet.

### Decision and Risk Badges (signature)
`DecisionBadge` and `RiskTierBadge` are the most important marks in the system. Each is a tinted fill, a `-text` tone, a Lucide icon and a plain label, in 12px medium Inter. A DENY badge is readable on the first frame: it fades in only, never slides or scales. `RiskScore` shows a number and a bar but no tier, because the policy score has no tier.

### Decision Path (signature)
A vertical timeline of the seven gates (Identity, Permission, Inspection, Policy, Risk Engine, Trajectory, Decision). Each step has an icon and a text status: passed, decided here, checked with no change, not reached, or not recorded. Exactly one step is "decided".

### Content Findings (signature)
A list of the gateway's content-inspection results (V13). Each finding is a hairline-bordered item (8px radius, 12px × 8px padding, 8px between items):
- **Header line** (14px Inter): a decision icon, then the category in medium weight, a muted "·" separator and the type label. The categories and their marks are Secret (DENY mark), Personal data (REVIEW mark) and Prompt injection (REVIEW mark).
- **Detail** (12px): a two-column list with muted "Location" and "Preview" terms. The values are in JetBrains Mono and break anywhere so long paths never overflow.
- **Order:** secrets first, then personal data, then prompt injection.
- **Footnote:** a muted line says the previews are redacted by the gateway and the raw values are never stored. The preview shown is the gateway's redacted string, such as `AKIA… (20 chars)`, never a raw value.
- **States:** "not recorded" when inspection did not run, and a plain muted sentence when nothing was found. That sentence names the resource and arguments, or the output for output-inspection rows.

## Do's and Don'ts

### Do:
- **Do** read colours through the semantic tokens (`bg-card`, `text-danger-text`). Never use raw OKLCH in components.
- **Do** pair every security state with an icon and a label. Colour only reinforces them.
- **Do** set identifiers, keys, resources and scores in JetBrains Mono with tabular figures.
- **Do** keep motion to transform and opacity: 120 ms for state changes, 200 ms for entrances, 320 ms for sheets, springs damped at ζ ≥ 0.8, and no more than one stagger per view.
- **Do** give every surface its Loading, Empty, Error and Unauthorized states.
- **Do** test new text/background pairs in both themes at a minimum of 4.5:1.

### Don't:
- **Don't** use neon accents, glowing text or a "hacker" aesthetic.
- **Don't** use green, amber, orange or red for anything other than a security state, and never use a brand tone to signal severity.
- **Don't** put shadows on cards or tables, or stack borders on adjacent surfaces.
- **Don't** replay entrance animations on a refetch, animate table cells, or use infinite decorative loops. Spinners and skeleton pulses are the only exceptions.
- **Don't** delay a verdict with motion. A DENY must be legible immediately.
- **Don't** show raw secrets or PII. Display only the gateway's redacted previews.
