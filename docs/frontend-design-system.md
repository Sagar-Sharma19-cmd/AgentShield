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

## 5. Page-by-page redesign plan (Shell, Overview, Activity, Reviews, Agents, Tools and Landing implemented; the rest planned)

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

### Overview: implemented as "Checkpoint" (Phase F3, see section 7)
- Header (eyebrow, title, Live indicator from the recent-evaluations query state, Refresh), then GateFunnel,
  CheckpointStream (full width), then ReviewTriage and SessionTrace side by side (stacked below `lg`).
- Kept: the live security alert feed (the header's alert indicator links here) and the all-time decision
  breakdown (the only all-time figure on the page).
- No longer on the page, but the files remain: `OverviewStats`, `RiskDistributionCard`, `RecentIncidentsCard`,
  `RecentActivityCard`. The stream and funnel replace their information for the recent sample. Their pure
  logic and tests (`lib/dashboard/metrics.ts`) are unchanged.

### Activity (`components/activity/*`): implemented (Phase F4)
- **Table** (`activity-list.tsx`): a dense table, not cards, from `md` up. Columns are relative time (the exact
  time is in the hover title and the sr-only text), agent, tool, action, resource (mono, truncated, full value
  on hover), gate (`gateFor` + icon from `checkpoint/gate-mark.tsx`), decision (icon + label) and the policy
  risk score. The audit row stores no Risk Engine score, so there is no column for one. The header is sticky
  inside the table's own scroll area (`max-h-[min(70vh,52rem)]`). A page-level sticky header would not work
  because the table also scrolls horizontally. Rows have hairline dividers and hover and focus-within fills.
  The selected row gets a fill plus a left bar, so selection does not rely on colour alone. Below `md`, rows
  become a compact list with the same fields.
- **Entrance**: the list is keyed by the server page (`JSON(toAuditSearchParams)`), so rows fade in (opacity
  only, `durations.base`, `staggerDelay`) on a page or filter change. Rows that arrive later from a refetch
  appear instantly. There is no animation under reduced motion.
- **Filters**: the existing draft form and URL model (`lib/activity/filters.ts`) are unchanged, laid out as one
  compact row that wraps. Applied filters show as removable chips, with "Clear all"
  (`activity-chips.tsx`, `activeFilterChips` / `withoutFilter`). Removing a chip goes back to page 1.
- **Gate chips**: these narrow the CURRENT page to one deciding gate, client-side (`gateCounts` /
  `filterByGate`). They do not change the URL or query the server, and the copy below them says so. Chips with
  a count of 0 are disabled. The selection resets when the page changes.
- **Keyboard** (`activityKey`, `isTypingTarget` in `lib/activity/table-model.ts`): J/K move focus between rows,
  Enter opens the focused row, Esc closes the sheet (Radix) and "/" focuses the agent filter. Shortcuts are
  ignored while the user types (inputs, textareas, selects, contenteditable, combobox/listbox roles), while
  the sheet or another overlay is open, and when Ctrl, ⌘ or Alt is held. A hint row shows the keys from `md` up.
- **Detail sheet**: decision badge and deciding gate, then:
  - "Decision path": a vertical timeline of the six gates (see the rules below).
  - Request facts: request ID with a copy button and a live "Copied" message, session, agent, tool, action,
    resource, sensitivity, timestamp, authorization result and reason, policy risk, outcome and registered IDs.
  - Trajectory evidence, as before.
  - Session context.
- **Session context**: this is the page's one new query, `useAgentAuditSample(agentId)`. It is keyed
  `auditKeys.list({agentId, page: 0, size: 100})`, filtered to the session client-side and drawn with the
  Overview's `SessionTraceChart`, with this request ringed. The UI says it covers the latest 100 requests of
  the agent, and says when the request is older than that sample.
- **States**: skeleton rows shaped like the table, the existing error pattern, and an empty state that points
  to `scripts/demo.sh`.

#### Decision path rules (`lib/activity/decision-path.ts`)
Statuses: passed, decided here, checked with no change, not reached, not recorded. Exactly one step is "decided".
- Identity or permission failure: decided there, with the authorization reason. Every later gate is not reached.
- Policy DENY: the Risk Engine and trajectory are not reached. The Risk Engine is never consulted after a DENY,
  and trajectory does not run on DENY.
- Policy REVIEW: the Risk Engine is "checked, no change" (its own score is not on the audit row). If
  `escalatedBy` is null (pre-V9 rows), it is "not recorded" instead. Trajectory is "checked, no change" if a
  score exists, otherwise "not recorded".
- Risk Engine REVIEW: policy passed (escalation only raises, so policy allowed it). Risk Engine DENY: policy
  "passed", with a note that the record does not say whether policy allowed the request or held it for review.
- Trajectory REVIEW: everything before it passed, and it is decided at trajectory.
- ALLOW: every gate passed. The trajectory step shows its score against the HIGH threshold (60), or says that
  no score was recorded.
- The final "Decision" step is decided only for ALLOW. Otherwise it reads "not allowed" or "held for review".

### Reviews (`components/reviews/*`): implemented (Phase F5)
- **Layout**: from `lg` up, the queue (left, 20–26 rem) and the selected review (right, a sticky pane below the
  app header with its own scroll). Below `lg`, the review opens in the existing sheet. Tab and selection are in
  the URL (`?tab=&review=&confirm=`); a legacy `?status=` link (Overview triage) maps to its tab.
- **Tabs** (`lib/reviews/tabs.ts`), all from the four existing `GET /reviews?status=` queries
  (`useReviewLists`, keyed `reviewKeys.list(status)`, so no new keys or requests):
  - Needs action: PENDING + IN_REVIEW with `expired=false`, soonest expiry first.
  - Approved / Rejected: every review in that status. The backend's `expired` turns true on decided reviews too
    once `expiresAt` passes, so it does not move them; the timeline shows what it means.
  - Expired: PENDING + IN_REVIEW with `expired=true`. Never actionable.
  - A count shows "–" until all of its lists have loaded.
- **Queue rows**: action + tool, resource (mono, truncated, full value on hover), agent, age, effective score +
  tier badge, status badge, the signal that escalated it (`lib/reviews/signal.ts`, same gate icons as the
  Overview) and an expiry countdown (`lib/reviews/expiry.ts`): "expires in 12 min", a warning icon and tone under
  5 min, "expired 3 min ago" after. The exact time is in the sr-only text and the hover title. The page clock
  ticks every 30 s, so the text changes at most that often.
- **Signal attribution** (`lib/reviews/signal.ts`): the review's recorded `escalatedBy` (V11, the same value as
  the audit row): `NONE` is Policy, `RISK_ENGINE` and `TRAJECTORY` as named. Only when it is null (a review from
  before V11 without attribution) does the old text rule apply: `originalDecision` REVIEW means Policy, and an
  escalated ALLOW is read from the gateway's fixed reason suffix. Otherwise it shows "Not recorded". The detail
  pane also tries the audit row's `escalatedBy` before the text rule.
- **Keyboard** (`lib/reviews/queue-keys.ts`, built on `triageKey`): a listbox with one tab stop. J/K move, Enter
  opens, S starts (same mutation as the button), A/R only open the existing confirmation dialog. Decided or
  expired reviews explain why instead. Ignored while typing or while a dialog is open. A hint row shows the keys.
- **Detail**: stamp (status, or "Expired" for an open review past expiry), title, resource, agent, effective
  score and tier. Then "Why it needs review" (signal, recorded reason, trajectory factors, and `DecisionPath` from
  the audit row), the timeline, actions, request facts with copy buttons, a link to the request in Activity, and
  the current grant. Actions that cannot be used are shown disabled with the reason (`lib/reviews/availability.ts`).
- **Timeline** (`lib/reviews/timeline.ts`): Created → In review → Decision → Agent claim. Each step is done /
  now / not yet / will not happen / expired, with an icon and a text label. The backend stores no start time, so
  In review has a time only while the review is IN_REVIEW (`updatedAt`).
- **Motion**: status badges and the stamp fade in place on change (opacity, `fast`). A row leaving the tab fades
  out and the rest close the gap with `springs.layout`; reduced motion keeps the fade only. The sticky pane is
  never transformed.
- **States**: two-pane skeletons, the existing `SectionError`, and an empty state for each tab. Needs action points
  to `python3 simulator.py --scenario review_required` and the CI/CD demo.

### Agents (`components/agents/*`): implemented (Phase F6)
- **Layout**: like Reviews. From `lg` up, the registry (left) and the selected agent in a sticky pane (right);
  below `lg`, the existing sheet. Both render one `AgentDetailBody` from one `useAgentDetailController` owned by
  the workspace, so the rotation hold (`lib/agents/rotation-hold.ts`) and the one-time key protections are the
  same in both. While a hold is set the layout is frozen, so a resize cannot swap containers and drop a key.
- **Registry**: a dense table from `md` (name + description, status badge with icon, key prefix in mono, created
  date with the full time on hover) and compact rows below `md`. Status filter (URL) and search (local) as before.
  The selected row has a left rule and `aria-current`. There is **no "tools granted" column**: grants are only
  listed per agent (`GET /permissions/agent/{id}`), so a count per row would need one request per agent.
- **Identity header**: status stamp, name (mono), key prefix, agent id, created/updated, description, and the
  plain-language status effect. Only the key prefix is ever shown.
- **Lifecycle**: unchanged logic, confirmations and one-time key dialog. Revoke is the only solid danger button,
  with a one-line note that it is permanent and that Suspend is the reversible option.
- **Permission matrix** (`lib/agents/permission-matrix.ts`): rows are registered tools (plus any grant whose
  tool is not in the loaded list), columns READ / WRITE / DELETE / EXECUTE / EXTERNAL_REQUEST. A cell is a check
  in a solid box (granted), a check in a dashed box (granted, not in effect, with the reason on the row: agent
  suspended/revoked, tool disabled, grant disabled) or a dash (not granted), and always has screen-reader text.
  High-risk columns carry a shield icon and "(higher risk)" text.
  - **It is a read view.** The API has no endpoint that changes a grant's actions (POST and DELETE only), so
    "Edit grant" explains that, and offers the existing revoke confirmation. After a revoke started there, the
    grant form is pre-filled with the same tool and actions to adjust and grant again. "Revoke" on a row is the
    existing revoke flow; "Grant" on an ungranted row pre-selects the tool in the existing grant form.
  - Granting DELETE, EXECUTE or EXTERNAL_REQUEST opens a confirmation with one line of risk per action
    (`HIGH_RISK_ACTION_COPY` in `lib/agents/permission-grant.ts`). The request is the same `POST /permissions`.
- **Recent activity** (`lib/agents/activity-sample.ts`): `useAgentAuditSample(agent.name)` (audit rows record the
  agentId the request claimed, which is the registered name). A gate breakdown (`gateFor`) for the whole sample,
  labelled "Latest 100 requests" (or the real count), and the 8 newest requests with `DecisionIcon` + `GateMark`,
  each linking to the request in Activity. "Open in Activity" filters by the agent's name.
- **Register flow**: logic unchanged; step labels added. The key dialog keeps every protection (shown once, copy
  button, closes only through "I have saved this key" or the explicit discard choice). No animation on the key.

### Tools (`components/tools/*`): implemented (Phase F6)
- Rows with a type icon per tool type (`tool-type-icon.tsx`, always next to the type label), name (mono), type,
  description, status badge and an enable switch. Status filter with counts and search
  (`lib/tools/registry.ts`, local state).
- Enabling calls the existing status endpoint directly, as before. Turning the switch off opens the existing
  confirmation, which now says every agent using the tool is denied at the Permission gate (TOOL_DISABLED) and
  that grants are kept.
- No "used by" count: it cannot be derived from data the page loads without one grants request per agent.
- Empty state explains what a tool is and offers the register action.

### Landing (`/welcome`, `components/landing/*`): implemented (Phase F8)
- Public route outside the `(console)` group, so no AppShell and no admin key. Linked from the unlock card.
- Sections: Intro (outlined "Runtime" / "Security", a prompt box typing real requests with their verdicts),
  Product (pipeline stages as WAI-ARIA tabs, auto-advance with a Pause control), Scenarios (the five simulator
  scenarios and the trajectory demo with their documented outcomes), Footer. Content in `lib/landing/content.ts`.
- The robot (`sentinel-scene.tsx`, three.js) is loaded with `next/dynamic` (`ssr: false`), so three.js is only
  in the `/welcome` on-demand chunk. It is `aria-hidden`; every meaning is in the HTML. Camera states blend with
  scroll (`lib/landing/camera.ts`), plus pointer parallax, idle bob, head sway and blink. The face shows a check
  (ALLOW), an eye (REVIEW) or a barred circle (DENY) for the selected scenario. Colours are read from the tokens.
- Reduced motion: fixed camera, static pose, no typing (all requests shown), no auto-advance. Rendering pauses
  when the tab is hidden or the sections are off screen; pixel ratio is capped at 2 (1.5 at 900 px and below);
  everything is disposed on unmount. Without WebGL, a large logo mark is shown instead.
- Framing (F8.1, `lib/landing/camera-states.ts` + `frameCamera`): each camera state names where the robot sits
  on screen and the largest share of the viewport it may take, so it backs off instead of reaching the text.
  Intro and product frame it in the right half (text columns stop at 50vw); scenarios in the left half. The
  camera reaches a state when its section is centred and dwells there (`CAMERA_HOLD`).
- The right rail is shown from 1200 px. At 900 px and below the guides are hidden, the robot sits centred in
  the top part of the screen with the text below it, and each text block (not the whole column) gets a tight
  paper backing. The prompt-box header shows only "Agent request" below 640 px.

### CI/CD pipeline runs (`components/pipeline/*`): implemented (Phase F7)
- A run is the selected agent's audit rows sharing one simulator session id, `ci-<pipeline slug>-<12 hex>`
  (`simulator/enforcement.py`). Rows come from `useAgentAuditSample` (latest 100); reviews from `useReviewLists`.
  All logic is in `lib/pipeline/runs.ts` (`groupRuns`, `runSteps`, `runStatus`, `diffSteps`, `describeStep`).
- Left: run list (title, status icon + label, start time, per-step icons, sr-only step count). The newest run
  is followed until one is picked. Right: step cards joined by connectors, sized by a container query on the pane:
  one column, two from 36rem (horizontal connector within a row), one row from 56rem (about a 1600 px window).
  `tool.action` is never truncated; resources wrap only at "/", "-" or an inner "." (`lib/text.ts`, `BreakableText`).
- Step status rules: ALLOW → Allowed, executed. DENY → Blocked with its gate (`gateFor`). REVIEW → by its
  review: open and not expired → Waiting; APPROVED with `consumedAt` → Approved, executed; APPROVED unclaimed →
  Approved, not claimed (Expired once expired); REJECTED → Rejected; open past expiry → Expired; review not in
  the lists → Sent to review. No row → Skipped after a block/rejection/expiry or when a later step has a row,
  otherwise Not started. The run status is taken from the first step that did not run.
- Live: 4 s polling while the selected run is Waiting, or Running with a request in the last 10 min; 30 s
  otherwise. React Query pauses polling in a hidden tab. A changed card transitions colour and gets a short
  opacity highlight (none under reduced motion); its connector fills by `scale`. Fixed-height slots keep the cards
  from moving. Changes are announced in a polite live region.
- Read only: no approve/reject here. Each step links to its request in Activity and its review in Reviews.
- The "Mock execution only" note stays at the top.

---

### Shared page frame (Phase F9)
- Every console page uses `PageContainer` (max-w-7xl, or `wide` for CI/CD; gap-5, p-4 / md:p-8) and `PageHeader`
  (`components/shell/page-header.tsx`): eyebrow "Group · Topic" matching the sidebar group, the page's only h1,
  a one-line description, actions on the right.
- Loading, empty and error states: `SectionSkeleton` (or a skeleton shaped like the loaded layout), `SectionEmpty`
  (optional `action`, `titleAs="h2"` outside a card) and `SectionError`. Load errors use a polite `role="status"`;
  form validation errors keep `role="alert"`.
- Header icon buttons are 32 px with a 44 px hit area at 768 px and below (`TOUCH_TARGET`); the theme control is a
  single menu button there. The sidebar environment badge reads `NEXT_PUBLIC_AGENTSHIELD_ENV` (default "Local").

## 6. Limitations and open questions

- The hex values are computed conversions (OKLCH to sRGB with gamut clamping). Different tools may round
  differently by ±1.
- Badge-on-tint contrast was measured with a one-off script, not a committed test. Adding it would need
  alpha-compositing support in `contrast.ts`.
- Charts have not yet been checked for colour-vision deficiency beyond the hue spacing in this doc.
- The redesign plan in section 5 has not been user-tested.

---

## 7. Signature: Checkpoint (Overview)

AgentShield is a gateway. Every agent request passes, in order:
**Identity → Permission → Policy → Risk engine → Trajectory → Decision**. The Overview shows that
pipeline rather than generic KPI cards. Visual rules: hairline borders, dashed hairline gate dividers, mono
uppercase micro-labels, tabular numbers, no glow, neon or gradients.

### Gate derivation (`src/lib/checkpoint/gates.ts`, `gateFor`)

Only recorded audit fields are used (`authorizationResult`, `decision`, `escalatedBy`). Nothing is re-scored.

| authorizationResult | decision | escalatedBy | Gate |
|---|---|---|---|
| `AGENT_NOT_FOUND`, `AGENT_SUSPENDED`, `AGENT_REVOKED`, `AGENT_IDENTITY_MISMATCH` | any | any | **Identity** |
| `TOOL_NOT_FOUND`, `TOOL_DISABLED`, `UNAUTHORIZED`, `PERMISSION_DISABLED` | any | any | **Permission** |
| `AUTHORIZED` | ALLOW | any | **Passed** (shown as "Allowed") |
| `AUTHORIZED` | DENY | `RISK_ENGINE` | **Risk engine** |
| `AUTHORIZED` | DENY | `NONE`, `TRAJECTORY`, null | **Policy** |
| `AUTHORIZED` | REVIEW | `TRAJECTORY` | **Trajectory** |
| `AUTHORIZED` | REVIEW | `RISK_ENGINE` | **Risk engine** |
| `AUTHORIZED` | REVIEW | `NONE`, null | **Policy** |

`escalatedBy` is null on rows written before V9. Those non-ALLOW rows fall back to Policy, because the data
cannot show that a later stage was involved. Trajectory never produces DENY, so DENY + `TRAJECTORY` is not
expected; it is treated as Policy rather than attributed to trajectory.

### The four components (`src/components/checkpoint/`)

1. **GateFunnel**: five stages (Requests, Authorized, Passed policy, Passed risk, Allowed) with an
   `AnimatedNumber`, the share of requests, and a thin bar animated with `scaleX` (transform only). It is
   labelled "Last N requests", where N is the sample size (the dashboard's newest 100 audit rows at most). The
   footnote says that HTTP 401 rejections (bad or missing agent key) never reach the gateway and are not counted.
2. **CheckpointStream**: six gate columns with dashed dividers. Each of the 40 newest rows is a dot (decision
   icon + colour) that travels from the left and stops at its gate.
   - On first load, the newest 20 replay.
   - After that, only requestIds not seen before travel.
   - At most 12 dots travel at once (`checkpointMotion`: 320 ms travel, 50 ms apart).
   - With reduced motion, dots fade in at their gate.
   - A visible `role="status"` line summarises arrivals ("3 new: 2 allowed, 1 denied at Policy").
   - A Pause control freezes the view; on resume, the missed arrivals travel in.
   - Dots are links to the existing activity detail (`/activity?request=…`). There is one tab stop, and the
     arrow keys move between dots.
3. **ReviewTriage**: open reviews (PENDING + IN_REVIEW) from the existing review list queries.
   - It is a keyboard listbox: J/K move, Enter opens the review on the Reviews page, and A/R open the
     existing approve/reject confirmation there (`/reviews?…&confirm=approve`).
   - `confirm` is honoured only when the status allows that action (IN_REVIEW). It only pre-opens the dialog,
     and the operator still confirms.
   - On a PENDING review, A/R explain that it must be started first. Nothing is ever decided from the Overview.
4. **SessionTrace**: an SVG line of the trajectory score over the most escalated session in the sample, with a
   dashed HIGH threshold at 60.
   - Points use the decision icon + colour, and each has a `<title>` tooltip.
   - Requests without a trajectory score sit in an "n/a" lane below the axis instead of being drawn as 0.
   - The x axis is request order.
   - A visually hidden table lists every point.
   - When no session in the sample has a trajectory score, a calm empty state is shown.

### Data

All four components read existing queries only: `useRecentEvaluations` (dashboard, 100 newest audit
rows) and `useReviewsByStatus("PENDING" | "IN_REVIEW")`. There are no new endpoints or query keys. Audit
rows do not carry the Risk Engine score, so the stream and trace use the policy score, decision and
trajectory score only.
