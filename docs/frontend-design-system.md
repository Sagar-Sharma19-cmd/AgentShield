# AgentShield Frontend Design System ("Graphite")

Status: foundation implemented (tokens in `frontend/src/app/globals.css`, motion tokens and primitives in
`frontend/src/lib/motion/` and `frontend/src/components/motion/`). The page-by-page redesign in section 5 is a
plan. Unless a section says it is done, it has not been built.

Scope: the operator console in `frontend/`. Stack: Next.js 16 App Router, React 19, Tailwind 4 (CSS-first
tokens), shadcn/Radix, React Query, Recharts, next-themes, `motion` (`motion/react`).

---

## 1. Style direction

**Brief:** a security operations console for a developer tool. Users are engineers and security reviewers.
Dark-first, with an equal-quality light theme. It should feel precise, calm and trustworthy, and stay
data-dense but readable. Not a neon "hacker" theme.

**Direction: Graphite.** The surfaces are near-neutral graphite with a faint blue cast. There is one indigo-blue
accent for interaction and focus. Saturated colour is reserved for **security state** (ALLOW / REVIEW / DENY,
risk tiers), so that when colour appears, it means something.

### How the ui-ux-pro-max skill was used

The skill was run with `--design-system` and with supplementary `style`, `color`, `typography`, `ux` and
`shadcn` searches. Its recommendations were adopted selectively:

| Skill output | Decision | Reason |
|---|---|---|
| Style **"Data-Dense Dashboard"**: KPI row, compact cards, 12–14 px table type, sticky headers, row hover highlight | **Adopted** | Matches Activity, Reviews and Agents, which are mostly tables |
| Style **"Minimalism & Swiss"**: grid-based, essential elements only, sharp/no shadows, 200–250 ms hovers | **Adopted** for surfaces and elevation | This is the Linear/Vercel look in the brief |
| Style **"Dark Mode (OLED)"**: slate `#0F172A`/`#1E293B` base, 7:1 text, visible focus | **Partly adopted.** Graphite dark base, high text contrast | Its "vibrant neon accents" and text-glow were **rejected** because the brief rules them out |
| Palette **"Financial Dashboard"**: dark bg + green positive indicators | **Adopted** as the semantic idea (green = allowed) | |
| Typography **"Dashboard Data" (Fira Code + Fira Sans)** | **Not adopted.** Kept Inter / Space Grotesk / JetBrains Mono | See section 3. The reason is not strong enough to change fonts |
| Landing pattern **"Horizontal Scroll Journey"** | **Rejected** | It is a marketing-page pattern. This is an app console |
| UX rules: 150–300 ms micro-interactions, transform/opacity only, ease-out in / ease-in out, ≤ 1–2 animated elements per view, no infinite decorative animation, respect `prefers-reduced-motion`, z-index scale | **Adopted** in section 4 | |

**Reference points** (named in the brief, used as direction rather than copied):

1. **Linear**: graphite dark surfaces, a single cool accent, a sidebar darker than the content, small radii,
   tight type.
2. **Vercel dashboard**: near-white light theme with hairline borders instead of shadows, and monospace for
   identifiers.
3. **Datadog**: dense tables and status chips where icon + label + tone agree.

There is no `frontend/design-refs/` folder in the repository, so no local reference images were used.

### What changed from the previous theme

The previous theme was pastel (lilac paper, violet ink, mint/peach/sky surfaces, `--radius: 0.75rem`).
Graphite keeps every CSS variable name. It changes values only, plus four additive tokens
(`--risk-high`, `--risk-high-text`, `--ease-enter`, `--ease-exit`). The `--brand-*` names stay, but their
values are muted (indigo, teal, sky, amber) so the few places that use them still work.

---

## 2. Color tokens

Authored in **OKLCH** in `globals.css`, because `theme-contrast.test.ts` parses `oklch()`. Hex values
below are sRGB conversions computed from those OKLCH values, for reference only. Alpha tokens show
`@ n%`.

### Core surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#F9FAFB` | `#0C0D11` | Page |
| `--foreground` | `#15181F` | `#F0F2F4` | Body text |
| `--card` / `--card-foreground` | `#FFFFFF` / `#15181F` | `#131519` / `#F0F2F4` | Cards, tables |
| `--popover` / `--popover-foreground` | `#FFFFFF` / `#15181F` | `#17191E` / `#F0F2F4` | Menus, popovers, sheets |
| `--primary` / `--primary-foreground` | `#3A58C3` / `#FBFCFD` | `#82A1F6` / `#0C0F18` | Primary buttons, active states, links |
| `--secondary` / `--secondary-foreground` | `#EEF0F4` / `#23262E` | `#1F2227` / `#E9EBEF` | Secondary buttons |
| `--muted` / `--muted-foreground` | `#F0F2F4` / `#5F636C` | `#1C1E22` / `#A1A5AC` | Subtle fills, secondary text |
| `--accent` / `--accent-foreground` | `#EEF0F4` / `#15181F` | `#21242A` / `#F0F2F4` | Hover fills (shadcn "accent") |
| `--border` | `#E1E3E6` | `#FFFFFF @ 9%` | Hairlines |
| `--input` | `#D5D7DB` | `#FFFFFF @ 13%` | Input borders |
| `--ring` | `#4767D3` | `#82A1F6` | Focus ring |
| `--sidebar` | `#F4F5F7` | `#090A0E` | Sidebar, darker than the page in dark mode (Linear) |
| `--sidebar-accent` | `#E6E8EC` | `#1B1D22` | Active nav item |
| `--glow` | `#BDCDF6 @ 22%` | `#536DB7 @ 10%` | Faint radial wash behind the page |

### Security semantics: decisions

Colour never carries meaning alone. Every state has an **icon** and a **text label**, and the tone only
reinforces them. Icons are from Lucide (already used by `DecisionBadge`).

| Decision | Icon | Label | Fill token (badge tint) | Text token | Light text | Dark text |
|---|---|---|---|---|---|---|
| **ALLOW** | `CircleCheck` | "Allowed" | `--success` (10%) | `--success-text` | `#006836` | `#6AD895` |
| **REVIEW** | `Clock` | "Review required" | `--warning` (20%) | `--warning-text` | `#874E00` | `#F7C15F` |
| **DENY** | `Ban` | "Denied" | `--danger` (10%) | `--danger-text` | `#B7191C` | `#FF8880` |

Labels come from `DECISION_LABELS` in `src/lib/labels.ts`. The table shows the intent. The code is the source.

### Security semantics: risk tiers

| Tier | Icon | Label | Fill token | Text token | Light text | Dark text |
|---|---|---|---|---|---|---|
| **LOW** (0–29) | `ShieldCheck` | "Low risk" | `--success` | `--success-text` | `#006836` | `#6AD895` |
| **MEDIUM** (30–59) | `ShieldHalf` | "Medium risk" | `--warning` | `--warning-text` | `#874E00` | `#F7C15F` |
| **HIGH** (60–79) | `ShieldAlert` | "High risk" | `--risk-high` (new) | `--risk-high-text` (new) | `#9F4500` | `#FEA668` |
| **CRITICAL** (80–100) | `Flame` | "Critical risk" | `--danger` (20%, stronger border) | `--danger-text` | `#B7191C` | `#FF8880` |

Before this change, HIGH and CRITICAL shared the red tone and differed only by icon. HIGH is now orange
(`--risk-high`: light `#E16C10`, dark `#F58B4B`), so the four tiers form a ramp. `RiskTierBadge` uses it.

Tier bands are the Risk Engine's bands (`risk-engine/scoring.py`). The policy `riskScore` on audit rows has
**no tier**, and `RiskScore` deliberately shows only the number and a bar. Keep it that way.

### Status fills (solid)

| Token | Light | Dark |
|---|---|---|
| `--success` / `-foreground` | `#007E46` / `#FBFCFD` | `#43C07A` / `#061009` |
| `--warning` / `-foreground` | `#F0B135` / `#362207` | `#EDB345` / `#1E1406` |
| `--danger` = `--destructive` / `-foreground` | `#C92324` / `#FBFCFD` | `#EF6661` / `#150A09` |

### Charts

| Token | Light | Dark | Meaning in current charts |
|---|---|---|---|
| `--chart-1` | `#4C6AC8` | `#82A1F6` | LOW bucket (risk distribution) / primary series |
| `--chart-2` | `#1B9388` | `#55BFB3` | Secondary series |
| `--chart-3` | `#E49E22` | `#F3B94C` | MEDIUM bucket |
| `--chart-4` | `#DA4433` | `#F66E60` | HIGH bucket |
| `--chart-5` | `#7A808D` | `#898F9C` | Neutral / "other" |

Charts must also label their values (axis plus direct labels or a table alternative). They must not rely on
the hue mapping alone.

### Brand (decorative only)

| Token | Light | Dark |
|---|---|---|
| `--brand-lilac` / `-soft` (now indigo) | `#6880D4` / `#E9EEFC` | `#768EDC` / `#1B2133` |
| `--brand-mint` / `-soft` (now teal) | `#46B3A6` / `#E4F6F3` | `#46B3A6` / `#0F2623` |
| `--brand-sky` / `-soft` | `#69AED5` / `#E6F4FE` | `#63A8CF` / `#13242E` |
| `--brand-peach` / `-soft` (now amber) | `#E9A679` / `#FDEFE5` | `#D59466` / `#2F2016` |

The `-soft` tones are backgrounds only. Text on them uses `--foreground`. Never use a brand tone to signal
severity.

### Contrast evidence

- `src/lib/design/theme-contrast.test.ts` (unchanged): 20 pairs × 2 themes, all ≥ 4.5:1.
- `src/lib/design/semantic-contrast.test.ts` (new): status text on cards, `--risk-high-text` on background and
  card, `--muted-foreground` on card and sidebar, foreground on popover. All ≥ 4.5:1. It also checks that HIGH
  and CRITICAL text hues differ by at least 20°.
- Badge text on its tinted fill (the real rendering, alpha-composited over `--card`) was checked with a
  one-off script, not a committed test. Lowest result: light CRITICAL at 4.77:1. All others are ≥ 5.5:1.

---

## 3. Typography, spacing, radius, elevation, borders

### Typefaces (unchanged)

| Role | Font | Utility | Why it stays |
|---|---|---|---|
| Body, UI, tables | **Inter** (variable) | `font-sans` | Tuned for small UI sizes, has tabular figures, and is the de facto Linear/Vercel face |
| Headings | **Space Grotesk** | `font-heading` | Gives a slightly technical character to page titles only. Used sparingly it does not hurt density |
| Identifiers, keys, JSON, request IDs, scores | **JetBrains Mono** | `font-mono` | Clear `0/O`, `1/l/I`. That matters for API keys and IDs |

The skill suggested Fira Code + Fira Sans. Its reasons (a technical feel, mono for data) are already met by
JetBrains Mono + Inter. Changing fonts would add self-hosted font files and visual churn for no clear gain.
The fonts stay self-hosted so the build works offline.

### Type scale (Tailwind utilities, rem at 16 px)

| Step | Size / line height | Weight | Use |
|---|---|---|---|
| `text-2xl` | 24 / 32 | 600, `tracking-tight`, Space Grotesk | Page title (one per page) |
| `text-lg` | 18 / 28 | 500, Space Grotesk | Sheet/dialog title |
| `text-base` | 16 / 24 | 500, Space Grotesk | Card title |
| `text-sm` | 14 / 20 | 400–500 | Body, table cells, form controls |
| `text-xs` | 12 / 16 | 500 | Labels, badges, metadata, table headers |
| `text-3xl` mono | 30 / 36 | 600, `tabular-nums` | KPI numbers |

Rules: use `tabular-nums` for every number that updates or sits in a column. Keep line length at 65–75ch for prose
(`max-w-2xl`/`max-w-3xl`). Use uppercase only for tiny eyebrow labels, with `tracking-wide`.

### Spacing

The Tailwind 4 base unit is 4 px. Use a small set:

| Context | Value |
|---|---|
| Inside dense rows, badges | `gap-1.5` (6 px), `px-2` |
| Card padding | `p-4` (16 px), with `size="sm"` → 12 px |
| Between cards in a grid | `gap-4` (16 px) |
| Between page sections | `gap-6` (24 px) |
| Page gutter | `p-4` mobile, `md:p-8` |
| Page max width | `max-w-7xl` for table pages (Activity), `max-w-6xl` for Overview, `max-w-5xl` for forms/registries |

### Radius

`--radius` changed from **0.75rem to 0.625rem (10 px)**. Smaller radii read as more precise. The derived scale
is unchanged: `rounded-sm` 6 px, `rounded-md` 8 px, `rounded-lg` 10 px (buttons, inputs), `rounded-xl` 14 px
(cards).

### Elevation and borders

Elevation is mostly **hairline borders plus surface step**, not shadow (Swiss / Vercel).

| Level | Treatment | Use |
|---|---|---|
| 0 | `bg-background` | Page |
| 1 | `bg-card` + `ring-1 ring-foreground/10` (existing Card) | Cards, tables |
| 2 | `bg-popover` + `border` + `shadow-md` | Dropdowns, popovers, toasts |
| 3 | `bg-popover` + `border` + `shadow-lg` + overlay | Dialogs, sheets |

In dark mode shadows are nearly invisible, so the lighter surface step (`card` → `popover`) carries the
elevation. Use one border colour (`--border`) everywhere. Do not stack borders on adjacent surfaces.

### Z-index scale

`z-10` sticky table headers · `z-20` app header (existing) · `z-40` overlays · `z-50` dialogs, sheets, toasts
(Radix defaults). Do not use arbitrary large values.

---

## 4. Motion system

Implemented in `src/lib/motion/tokens.ts` (seconds, for `motion/react`). The CSS mirrors `--ease-standard`,
`--ease-enter` and `--ease-exit` are kept in sync by `tokens.test.ts`.

### Tokens

| Token | Value | Use |
|---|---|---|
| `durations.fast` | 120 ms | Hover, press, toggles, colour/opacity state |
| `durations.base` | 200 ms | Entrances, list insertion, popovers, page fade |
| `durations.slow` | 320 ms | Sheets, dialogs, large layout shifts |
| `durations.countUp` | 500 ms | `AnimatedNumber` only |
| `easings.standard` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | State changes (default in `MotionConfig`) |
| `easings.enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | Decelerate in |
| `easings.exit` | `cubic-bezier(0.4, 0, 1, 1)` | Accelerate out |
| `springs.snappy` | k 500, c 40, m 1 (ζ ≈ 0.89) | Toggles, selection indicator |
| `springs.layout` | k 380, c 36, m 1 (ζ ≈ 0.92) | `layout` reorders, row insertion |
| `springs.gentle` | k 260, c 30, m 1 (ζ ≈ 0.93) | Panels, sheets |
| `distances.rise` | 8 px | SlideUp / StaggerItem |
| `stagger.each` / `maxTotal` | 40 ms / 300 ms | Lists. The per-item delay shrinks so a list never takes longer than 300 ms to start |

Every spring has a damping ratio of at least 0.8 (tested), so nothing bounces.

### Primitives (`src/components/motion/`)

Import each from its own file (no barrel), so unused primitives stay out of the bundle.

| Component | Behaviour |
|---|---|
| `FadeIn` | Opacity 0→1, `base`, `enter` easing. For content replacing a skeleton |
| `SlideUp` | Opacity plus 8 px rise. For new surfaces |
| `Stagger` + `StaggerItem` | Staggered SlideUp for the first render of a list or grid. `as="ul"`/`"li"` keeps list semantics. `count` caps total delay |
| `AnimatedNumber` | Counts to a value. Final value in an sr-only span, moving digits `aria-hidden`. Jumps straight to the value under reduced motion |
| `PageTransition` | Enter-only opacity fade keyed on the pathname. No transform, no exit (reasons in the source). Used by `AppShell` |

### Rules

**Animate:**
- **Entrances**: first render of a page's main blocks (KPI tiles, cards). One stagger per view at most.
- **List changes**: a new audit row or alert arriving (`SlideUp`/`layout` spring), and a removed row fading out.
- **State changes**: decision or review status changing after an action (colour/opacity, `fast`), and the
  selected-row indicator.
- **Page transitions**: the opacity fade only.
- **Numbers**: KPI values on first load and when a refetch changes them.

**Never animate:**
- Anything for reduced-motion users beyond opacity. `MotionConfig reducedMotion="user"` removes transforms,
  the CSS guard in `globals.css` stops Tailwind animation, and `AnimatedNumber` checks for itself.
- Data on **refetch** when nothing changed. Polling must not replay entrances.
- Width, height, top or left. Use transform and opacity only.
- Decorative loops. Infinite animation is allowed only for loading spinners and skeleton pulse.
- Security verdicts in a way that delays them. A DENY badge must be readable on the first frame (fade only, no
  slide or scale).
- Table cells, form fields while typing, focus rings, or scroll position (no scroll-jacking or parallax).
- An element with both Tailwind `transition-*`/`animate-*` classes and motion props. Put the motion
  primitive on a wrapper, or pick one system for that element. Tailwind transition classes are **not**
  removed globally.

---

## 5. Page-by-page redesign plan (not yet implemented)

Constraints for every page: no changes to API calls, query keys, React Query logic, admin-key handling or
security semantics. Every state needs Loading, Empty, Error and Unauthorized views. The layout must work at
375, 768, 1024 and 1440 px.

### Shell (`components/shell/*`) — implemented (Phase F2)
- **Sidebar**: 240 px, collapsible to a 56 px icon rail. The choice is stored in localStorage
  (`agentshield-sidebar-collapsed`, read and written in try/catch, see `lib/shell/sidebar-preference.ts`). The
  width changes instantly. In the rail, labels and group headings are screen-reader-only and a tooltip shows the
  label.
- **Groups**: Monitor (Overview, Activity), Respond (Reviews), Configure (Agents, Tools), Demo (CI/CD demo).
  The group is a field on each `NAV_ITEMS` entry, and `navSections()` derives the sections from it.
- **Active item**: a pill with a shared `layoutId` (`springs.snappy`) and a 3 px primary bar, plus `aria-current`
  and medium weight, so colour is not the only signal. The desktop sidebar and the mobile sheet use separate
  `LayoutGroup` ids.
- **Reviews badge**: PENDING count from the existing `useReviewsByStatus("PENDING")` query (same key, endpoint
  and 30 s refresh as the Reviews page). Hidden while unknown, on error, or at 0. Capped at "99+". Screen
  readers hear "Reviews 3 pending".
- **Brand**: the original shield-with-filter-bars `LogoMark` on a tinted primary tile, plus the wordmark.
- **Footer**: "Admin session", environment label "Local" (hard-coded; no environment config exists) and the
  lock button (`clearAdminKey`).
- **Header**: breadcrumbs (`breadcrumbsFor`), a search button showing ⌘K / Ctrl K that opens the command
  palette, the unread-alert indicator (from `SecurityAlertsProvider`, linking to the Overview feed) and the
  theme switcher. There is also a "Skip to main content" link.
- **Command palette** (`command-palette.tsx`, cmdk + Radix Dialog): go to each page, toggle theme or use the
  system theme, lock the console. The list comes from `lib/shell/commands.ts` (pure, tested). It opens with a
  scale + fade (`base`/`enter` in, `fast`/`exit` out), and reduced motion leaves the fade only. The shortcut
  does not open the palette over another open dialog.
- **Mobile**: the sheet nav uses the same grouped `SidebarNav` and footer.
- **Unlock panel**: a centred card with the logo, why the key is needed, three facts about how it is handled,
  and a `SlideUp` entrance. Key validation and storage are unchanged.
- **Route fade**: `PageTransition` (opacity only).

### Overview (`components/dashboard/*`)
- KPI row of four tiles: `Stagger` + `AnimatedNumber` (replaces the CSS `animate-in` and delay style on
  `StatTile`).
- The security alert feed stays second. New alerts enter with `SlideUp`, and unread items get a dot plus the
  text "New".
- Decision breakdown: a segmented bar plus a legend with icon, label, count and percentage for each decision.
- Risk distribution: Recharts bars with `--chart-1/3/4`, direct value labels, and an accessible table
  fallback.
- Recent incidents and recent activity: compact tables with mono request IDs.

### Activity (`components/activity/*`)
- A full-width (`max-w-7xl`) dense table with a sticky header (`z-10`), row hover and a selected-row
  indicator.
- Columns: time, agent, tool, action, resource (mono, truncated with tooltip), decision badge, and policy,
  Risk Engine and trajectory scores, each labelled.
- Filters in a single toolbar row that wraps on mobile. On small screens the table becomes cards.
- Detail sheet (`springs.gentle`): a decision explanation first (why: policy reason, escalation source), then
  scores, then trajectory evidence.

### Reviews (`components/reviews/*`)
- Two panes on desktop (queue left, detail right). On mobile, a queue opens a sheet.
- Queue items: risk tier badge, decision reason, age, status badge.
- Detail: request context, the escalation chain (policy → Risk Engine → trajectory), then Approve/Reject at the
  bottom with a confirm step. The action result changes the status badge (colour fade, `fast`) and the item
  leaves the PENDING list with a fade plus a `layout` spring.

### Agents (`components/agents/*`)
- A registry table (desktop) or cards (mobile) with status badge (ACTIVE/SUSPENDED/REVOKED, each with an icon).
- Register flow: the one-time key dialog stays as is (security-critical copy and a copy button). No
  animation on the key itself.
- Detail sheet: summary, lifecycle actions with confirmation, and grants. Destructive lifecycle actions
  use `--danger`.

### Tools (`components/tools/*`)
- A compact registry table: name (mono), description, status badge (ACTIVE/DISABLED with icon), and a
  register dialog.
- Empty state explains what a tool is and links to the register action.

### CI/CD demo (`components/pipeline/*`)
- Keep the "Mock execution only" note at the top (warning tone, icon, text).
- Scenario selector, then the pipeline steps as a vertical stepper. Each step shows its gateway decision
  badge once it is recorded in the audit log.
- Results table limited to simulator rows (existing logic). New rows enter with `SlideUp`.
- Replace `bg-brand-lilac-soft` and `bg-brand-sky-soft` usage with `bg-muted` or the brand tones as
  re-tuned. They already work, so this is optional.

---

## 6. Limitations and open questions

- The hex values are computed conversions (OKLCH to sRGB with gamut clamping). Different tools may round
  differently by ±1.
- Badge-on-tint contrast was measured with a one-off script, not a committed test. Adding it would need
  alpha-compositing support in `contrast.ts`.
- Charts have not yet been checked for colour-vision deficiency beyond the hue spacing in this doc.
- The redesign plan in section 5 has not been user-tested.
