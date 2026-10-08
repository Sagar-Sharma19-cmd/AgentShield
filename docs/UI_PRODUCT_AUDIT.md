# AgentShield — UI & Product Audit

> **Status:** Planning/audit only. No feature, page, backend, or config was changed to produce this document.
> **Branch:** `feature/ui-product-plan` (based on `main` at `53440ba`).
> **Authority order used:** source code > `docs/architecture.md` > `README.md` > `CLAUDE.md`. Where the docs disagree with the code, this report follows the code and calls out the discrepancy.

---

## 1. Current Project State

| Area | State | Evidence |
|---|---|---|
| Runtime gateway | **Implemented.** `Authentication → PermissionEngine → PolicyEngine → RiskEngineClient → DecisionEscalator → ReviewRequest (if REVIEW) → AuditService` | `backend/.../gateway/GatewayService.java` |
| Risk Engine | **Implemented and integrated.** Python FastAPI scorer; Java calls it via `HttpRiskEngineClient` with a fail-safe fallback. Escalation-only. | `risk-engine/scoring.py`, `backend/.../riskengine/HttpRiskEngineClient.java` |
| Human review | **Implemented** (API only). Pending → In review → Approved/Rejected. | `backend/.../review/*` |
| Audit | **Implemented** write path and filtered, paginated read API. | `backend/.../audit/*` |
| Admin/agent management | **Implemented** (API only). | `agent/`, `tool/`, `permission/` |
| Frontend | **Foundation only.** Design tokens, shadcn/ui primitives, API client, types, and an admin-key context exist. **No real page is built yet.** `app/page.tsx` is still the create-next-app template. | `frontend/src/**` |
| Deployment | Docker Compose defines only PostgreSQL. Backend, risk-engine, and frontend services are commented out. | `docker-compose.yml` |
| Documentation drift | `CLAUDE.md` and `docs/product-requirements.md` still describe the Risk Engine as a stub that the backend never calls. **The code shows otherwise.** `CLAUDE.md` should be corrected in a later docs-only change. | `HttpRiskEngineClient`, `GatewayService` |

---

## 2. Backend Capabilities

All routes are under `/api/v1`. Auth is stateless: agent routes use `X-Agent-API-Key`, admin routes use `X-Admin-API-Key`. Verified against the controllers and `SecurityConfig.java`.

### Gateway (agent key → `ROLE_AGENT`)

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/api/v1/gateway/evaluate` | Evaluate one tool call | Returns `decision`, `reason`, `riskScore`, `authorizationResult`, `riskTier`, `riskEngineAvailable`, `reviewRequestId`, `requestId` |

### Admin (admin key → `ROLE_ADMIN`)

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/api/v1/agents` | Register agent | Returns plaintext `apiKey` **once** |
| GET | `/api/v1/agents` | List agents | Unpaginated, sorted by `createdAt` |
| GET | `/api/v1/agents/{id}` | Get agent | |
| PATCH | `/api/v1/agents/{id}/status` | ACTIVE / SUSPENDED / REVOKED | |
| POST | `/api/v1/agents/{id}/rotate-key` | Rotate key | Returns new `apiKey` **once** |
| POST | `/api/v1/tools` | Register tool | `toolType` enum |
| GET | `/api/v1/tools` | List tools | Unpaginated |
| GET | `/api/v1/tools/{id}` | Get tool | |
| PATCH | `/api/v1/tools/{id}/status` | ACTIVE / DISABLED | |
| POST | `/api/v1/permissions` | Grant agent→tool with `allowedActions` | |
| GET | `/api/v1/permissions/agent/{agentId}` | Permissions for one agent | Only per-agent listing |
| DELETE | `/api/v1/permissions/{id}` | Revoke | |
| GET | `/api/v1/reviews?status=` | List reviews by status | `status` is **required** |
| GET | `/api/v1/reviews/{id}` | Get review | |
| POST | `/api/v1/reviews/{id}/start` | Move to IN_REVIEW | |
| POST | `/api/v1/reviews/{id}/approve` | Approve | |
| POST | `/api/v1/reviews/{id}/reject` | Reject | |
| GET | `/api/v1/audit` | Search audit log | Filters: `agentId`, `decision`, `authorizationResult`, `from`, `to`. `page`, `size` (max 100). Sorted by `timestamp DESC`. |
| GET | `/api/v1/audit/{requestId}` | Audit row by gateway request ID | |

### Public

- `GET /actuator/health`, `GET /actuator/info` only. Everything else is denied.

### Data model (Flyway V1–V6)

`agents`, `tools`, `agent_tool_permissions`, `agent_tool_permission_actions`, `audit_logs` (indexed on `request_id`, `agent_id`, `timestamp`), `risk_assessments` (indexed on `request_id`), `review_requests` (indexed on `status`, `created_at`). Schema is validated by Hibernate, not auto-generated.

### Security properties (verified in code)

- Keys are HMAC-SHA256 hashed with a pepper (`AGENTSHIELD_API_KEY_PEPPER`, min 32 chars). Plaintext is returned once.
- Agent keys cannot reach admin routes and admin keys cannot reach gateway routes.
- CSRF disabled (header auth, no cookies); sessions disabled.
- Permission denial short-circuits everything, records riskScore 100, and never calls the Risk Engine.

### Gaps in the backend API (for UI planning)

- **No endpoint exposes `risk_assessments` rows.** The per-request factor breakdown is persisted but unreadable through the API.
- **Audit rows have no `riskTier` or `riskEngineAvailable`.** The audit view cannot show the Risk Engine's contribution without a join that doesn't exist.
- **No aggregate or analytics endpoints.** Nothing returns counts by decision, risk distribution, or trends over time.
- **No operator identity.** Approve/reject do not record who acted. All admins share one key.
- **Lists are unpaginated** for agents, tools, and reviews (reviews are filtered by status only).
- **No agent "last seen" or activity field.** Agent health cannot be shown without scanning the audit log.
- **No delete for agents or tools**, and no "list all permissions" view.

---

## 3. Risk Engine

### IMPLEMENTED

| Item | Status | Evidence |
|---|---|---|
| `GET /health` | Implemented | `risk-engine/main.py` |
| `POST /score` | Implemented, deterministic | `risk-engine/main.py`, `scoring.py` |
| Factor A `RESOURCE_SENSITIVITY` (+50) | Implemented | substring match on `.env`, `secret`, `credential`, `password`, `.pem`, `.key` |
| Factor B `PRODUCTION_ADMIN_CONTEXT` (+40) | Implemented | `prod`, `production`, `admin`, `protected` |
| Factor C `ACTION_BASE_RISK` | Implemented | READ 5, WRITE 10, DELETE 30, EXECUTE 30, EXTERNAL_REQUEST 25 |
| Factor D `COMPOUNDING_RISK` (+20) | Implemented | DELETE/EXECUTE + Factor B |
| Tiers | Implemented | LOW 0–29, MEDIUM 30–59, HIGH 60–79, CRITICAL 80–100 |
| Java integration | Implemented | `HttpRiskEngineClient`, `DecisionEscalator`, `RiskAssessmentService` |
| Fail-safe fallback | Implemented | Timeout, outage, or bad response → `riskEngineAvailable=false` and escalation to REVIEW. Never fails open. Timeout default 300 ms (`RISK_ENGINE_TIMEOUT_MS`). |
| Escalation rules | Implemented | ALLOW+HIGH→REVIEW, ALLOW/REVIEW+CRITICAL→DENY, DENY is final, REVIEW never becomes ALLOW |
| Persistence | Implemented | `risk_assessments` table, correlated by `request_id` |
| Tests | Python: **43 passed** (run during this audit). Java: `RiskEngineGatewayIntegrationTest` exists but was **not executed** in this audit. | |

### PLANNED / NOT IMPLEMENTED

- ML-based anomaly detection
- Trajectory or behavioural analysis (per-session risk aggregation)
- Caller-supplied `resource_sensitivity` (the field is accepted but deliberately ignored)
- A read API for risk factors (`/api/v1/risk/factors` is only a `[TARGET]` in `product-requirements.md`)
- Any Risk Engine feature that is not a deterministic substring rule

### Explainability reality check

The engine's `reason` and `factors[]` are real and good. The UI can't show them yet because nothing reads `risk_assessments`. What the UI *can* show today: the evaluation `reason` string (includes escalation notes), `riskScore` (the **policy** score, not the Risk Engine score), and `riskTier` on the evaluate response and review records.

---

## 4. Frontend Current State

### Stack (verified in `package.json` and config)

- Next.js **16.3.8** (App Router), React **19.2.8**, TypeScript ^5 (strict)
- Tailwind CSS **v4** (`@tailwindcss/postcss`), `tw-animate-css`
- shadcn/ui config (`components.json`): style `radix-nova`, base color neutral, lucide icons
- Radix UI (`radix-ui` ^1.7), lucide-react, sonner (toasts), next-themes
- TanStack Query ^5 (provider mounted, **no queries yet**)
- Zod ^4 (installed, **unused**)
- Recharts ^3 (installed, **unused**)
- ESLint 9 with `eslint-config-next`

### What exists

| Path | Content | Used by a page? |
|---|---|---|
| `src/app/layout.tsx` | Root layout. Inter (`--font-sans`) and Geist Mono (`--font-geist-mono`). Metadata "AgentShield". | Yes |
| `src/app/page.tsx` | **create-next-app template** ("edit the page.tsx file", Vercel "Deploy Now") | Yes, but it must be replaced |
| `src/app/globals.css` | Full design-token set (light + dark) in oklch. Sage primary, terracotta destructive, amber warning, plus `success`/`danger`/`chart-*`/`sidebar-*` tokens. | Yes |
| `src/components/ui/*` | 24 shadcn primitives: alert, alert-dialog, avatar, badge, button, card, checkbox, dialog, dropdown-menu, input, label, popover, progress, scroll-area, select, separator, sheet, skeleton, sonner, switch, table, tabs, textarea, tooltip | Only via layout (tooltip, sonner) |
| `src/components/providers.tsx` | QueryClient + AdminKeyProvider | Yes (layout) |
| `src/lib/api/client.ts` | `apiRequest()` — typed fetch wrapper, admin/agent header injection, `ApiError` with parsed `ErrorResponse` | **No** |
| `src/lib/api/endpoints.ts` | `agentsApi`, `toolsApi`, `permissionsApi`, `reviewsApi`, `auditApi`, `gatewayApi` — covers every backend route | **No** |
| `src/types/api.ts` | TypeScript mirrors of backend DTOs and enums | **No** (only imported by the API layer) |
| `src/lib/auth/admin-key.tsx` | Admin key in `sessionStorage` + context hook | Only by providers |
| `next.config.ts` | Rewrites `/api/v1/*` → `BACKEND_URL` (default `http://localhost:8080`). Avoids CORS on the backend. | Yes |
| `.env.example` | `BACKEND_URL` | — |
| `src/lib/utils.ts` | `export { cn } from "cn"` — re-exports from the npm package **`cn`**, not a local clsx + tailwind-merge helper | Yes (ui primitives) |

### Observations

1. **No real page exists.** There is no login/unlock UI, no navigation, no shell, no data view. The admin-key context has no consumer.
2. **The admin key is stored in `sessionStorage`.** `product-requirements.md` (line ~258) explicitly says dashboard auth must not reuse the raw admin key in browser storage long-term. This is acceptable as a dev-only stopgap, but it must be labelled and replaced before any real use.
3. **`lib/utils.ts` imports `cn` from the npm package `cn`.** shadcn's default is a local helper built on `clsx` + `tailwind-merge`. Both are installed. This looks like an accidental dependency and should be checked before more components are added.
4. **Unused dependencies** (zod, recharts, date-fns, @tanstack/react-query beyond provider) are fine to keep for the next features, but they should be added to only when first used.
5. **`frontend/AGENTS.md` warns** that Next 16 has breaking changes and says to read `node_modules/next/dist/docs/` before writing code. This must be followed in the first feature branch.
6. **No tests.** No test script, no Vitest, no Playwright, no test files.
7. **No Dockerfile** for the frontend. Compose entry is commented out.
8. **`frontend/.env.example` is staged** in git (`A`) on this branch but not committed. Decide whether to commit it with the first feature branch.
9. **Verification status:** see the Verification section at the end of this document.

---

## 5. Gaps

### Product gaps (what a user cannot do today)

| Gap | Impact |
|---|---|
| No UI at all | Operators must use curl or Postman to review anything |
| No way to see *why* a decision was made beyond one reason string | Explainability promise is unmet |
| Risk factors not readable | The Risk Engine's value is invisible |
| No aggregate view | No overview, no trends, no "what happened today" |
| Review decisions not attributed | No audit trail of which human decided |
| No agent health or activity signal | Cannot tell which agents are live |
| No simulator | Demo and evaluation require hand-built requests |

### Technical gaps

| Gap | Layer |
|---|---|
| No `GET` for risk assessments | Backend |
| No analytics endpoints | Backend |
| No reviewer identity on approve/reject | Backend + DB |
| No pagination for agents/tools/reviews | Backend |
| No frontend auth flow beyond the sessionStorage stopgap | Frontend + Backend |
| No frontend tests, no frontend CI job | DevOps |
| Frontend not in Docker Compose | DevOps |
| `CLAUDE.md` / `product-requirements.md` stale on Risk Engine | Docs |

### Not in scope yet (from CLAUDE.md "NOT IMPLEMENTED")

Prompt injection defence, indirect prompt injection, AI output secret detection, context manipulation defence, rate limiting, auth-failure lockout, per-operator RBAC, resource-path-scoped permissions, multi-tenancy, billing. **The UI must not imply any of these exist.**

---

## 6. Product Architecture

### Identity

AgentShield is a **runtime security gateway for AI agents** with human oversight. The UI is an operator console for that gateway. It is not a generic AI dashboard and not a chat product.

### Recommended application structure (Next.js App Router)

```
src/app/
├── (console)/                  # authenticated operator shell (layout with sidebar + topbar)
│   ├── activity/               # Runtime Activity: audit feed + filters   ← FIRST FEATURE
│   ├── activity/[requestId]/   # Decision detail: explainer for one gateway call
│   ├── reviews/                # Review queue (PENDING / IN_REVIEW / resolved)
│   ├── agents/                 # Agents list + detail + status + rotate key
│   ├── tools/                  # Tools list + status
│   ├── permissions/            # Per-agent permission editor (grants)
│   └── overview/               # Posture summary — only after analytics API exists
├── unlock/                     # Admin key entry (dev stopgap)
└── layout.tsx
```

Route groups keep the shell out of URLs. Server Components by default; Client Components only for filter forms, mutations, and polling.

### Component layers

- `components/ui/*` — shadcn primitives (already present)
- `components/security/*` — **new**: `DecisionBadge`, `RiskTierBadge`, `AuthorizationBadge`, `SensitivityBadge`. These are the only places that map enums to visuals.
- `components/data/*` — tables, empty/loading/error states, pagination
- `lib/api/*` — already present; add per-feature query hooks in `lib/queries/*`
- `lib/format/*` — timestamps, IDs (`requestId` truncation with copy), action labels

### Frontend ↔ backend

- Browser calls `/api/v1/*` on the Next origin; `next.config.ts` proxies to Spring. Keep this.
- Admin key is attached per request from context. No server-side session yet.
- Typed models come from `src/types/api.ts`. Keep it hand-written for now; generate from OpenAPI later only if the backend publishes one (it does not today).

---

## 7. UX Principles

1. **Operational, not decorative.** Every screen answers a security question. If a chart can't, don't add it.
2. **Decisions first.** ALLOW / REVIEW / DENY is the primary signal on every row and every detail page.
3. **Explain every decision.** Show the reason, the authorization result, and the policy/risk contribution side by side.
4. **Never color alone.** Each state has color + icon + text label. Works in greyscale.
5. **Real data or an honest empty state.** No placeholder numbers, no fake agents, no sample traffic in production builds.
6. **Density with hierarchy.** Dense tables are fine; the eye should land on decision and risk columns first.
7. **Calm motion.** Only state transitions (row appears, decision changes, skeleton → data). Respect `prefers-reduced-motion`.
8. **Desktop first, usable at tablet and phone.** Audit tables collapse to stacked cards below `md`.
9. **Accessible by default.** Keyboard-operable tables, focus rings from the token set, labelled dialogs, live region for review status changes.
10. **Honest about limits.** Show "Risk Engine unavailable — escalated to REVIEW" when `riskEngineAvailable=false`. Never hide fallbacks.
11. **Destructive actions are deliberate.** Revoke, reject, and suspend use confirmation dialogs that name the agent or tool.

---

## 8. Visual Research

Research was done with web search in this session. **Search returned listing pages and descriptions, not the rendered designs.** Entries are marked:

- **[listed]** — the URL appeared in a search result
- **[known site]** — a well-known design gallery; the specific page was not opened in this session

The primary reference from the brief was **not opened** (images are not retrievable through the tools available). Its layout and components must not be copied in any case.

| # | Product / reference | URL | Status | Useful for | AgentShield should learn |
|---|---|---|---|---|---|
| 1 | AI Infrastructure Platform — brief's primary reference | https://dribbble.com/shots/27625506-AI-Infrastructure-Platform-Web-Design | Not opened | Hierarchy, whitespace, restraint | Typographic hierarchy over giant headings; calm navigation. Do not copy layout or illustrations. |
| 2 | Cybersecurity SaaS dashboards (SOC, risk analysis) — Dribbble listings | https://dribbble.com/services/search/cybersecurity-saas | [listed] | Severity communication, dense security tables | Severity as label + icon + position, not colour alone; dense but scannable rows |
| 3 | uiyeasin — "Cybersecurity Control Center", "Cyber Risk Monitoring" | https://dribbble.com/uiyeasin | [listed] | SOC-style admin panels | Admin-panel information architecture. Avoid the default dark-navy look. |
| 4 | Lab7 — enterprise SIEM incident response and alerts list | https://dribbble.com/lab7agency/shots | [listed] | Enterprise alert triage, incident flows | Triage-oriented list design; alert detail patterns |
| 5 | uinafiur — attack surface and remediation dashboards | https://dribbble.com/uinafiur | [listed] | Risk scoring lists, remediation status | How risk tiers are shown as a ranked list, not a rainbow |
| 6 | keshavf — AI risk analysis dashboard and AI agent risk report | https://dribbble.com/keshavf | [listed] | AI-specific risk framing | Explainable risk breakdowns (factor lists). Pair with our Risk Engine factors. |
| 7 | AI Observability / AI Infrastructure dashboards (search results, e.g. "Trailux AI Observability Dashboard") | https://dribbble.com/services/search/ai-dashboard | [listed] | Token/cost/agent telemetry layouts | Telemetry framing for agent activity. Use only where real data exists. |
| 8 | Lapa Ninja — landing page gallery | https://lapa.ninja | [known site] | Landing and marketing sections | Marketing-page reference only. Not a dashboard reference. |
| 9 | Land-book — website section gallery | https://land-book.com | [known site] | Hero and feature section patterns | Section rhythm and copy structure for a future marketing page. |
| 10 | Mobbin — real product flows | https://mobbin.com | [known site] | Empty, loading, error, and permission flows | Reference the real states for review queue and unauthorized views. |
| 11 | Awwwards — award-winning web design | https://www.awwwards.com | [known site] | Motion restraint and typographic craft | Motion should be sparse. Use as a negative example for excess. |
| 12 | Godly — curated interface design | https://godly.website | [known site] | Modern interface detail, micro-states | Micro-interactions for toggles and status changes |

**Caveat:** No visual claim in this report depends on having seen these designs. Before the first feature is built, the team should open 4–5 of them directly and capture notes on the review queue and audit table specifically.

---

## 9. Proposed Design System

Tokens already exist in `frontend/src/app/globals.css`. This section **confirms and extends** them. No token changes are proposed in this audit.

### Colour philosophy

- **Base:** warm off-white (`--background` oklch 0.985 / 80° hue) with warm charcoal text (`--foreground`). Dark mode is defined and should be kept.
- **Brand accent:** muted sage (`--primary` oklch 0.47 0.06 155). Used for focus, primary actions, and the ALLOW state.
- **Warm accent:** terracotta-amber (`--accent`) for secondary emphasis and the REVIEW family.
- **Security states** (must stay distinct and restrained):

| Decision / tier | Token | Icon | Text label |
|---|---|---|---|
| ALLOW | `--success` (sage-green, desaturated) | check | "Allowed" |
| REVIEW | `--warning` (amber) | user/clock | "Needs review" |
| DENY | `--destructive` / `--danger` (terracotta-red) | ban / x | "Denied" |
| LOW | `--muted-foreground` outline | none | "Low" |
| MEDIUM | `--chart-2` / neutral-amber outline | none | "Medium" |
| HIGH | `--chart-4` solid text on tinted bg | triangle | "High" |
| CRITICAL | `--destructive` solid bg, white text | octagon | "Critical" |

Rule: the **label** always carries the meaning. Colour reinforces. Tiers are distinguished by weight and icon as well as hue.

### Typography

- **Sans:** Inter (already loaded as `--font-sans`). Keep it: it is legible at table densities and avoids novelty. Geist Sans is an acceptable alternative if the team prefers it, but switching is not worth the churn now.
- **Mono:** Geist Mono (`--font-geist-mono`) for request IDs, API keys, resource paths, and JSON. Mono is essential for auditability.
- **Scale:** 12 / 13 / 14 / 16 / 20 / 24 px. Page titles at 20–24 px. No display sizes inside the console.
- **Weights:** 400 body, 500 labels and table headers, 600 headings. Avoid 700+.
- **Numbers:** tabular numerals in every table and count.

### Spacing

- 4 px base grid. Common steps: 8, 12, 16, 24, 32.
- Table rows: 40 px (dense) / 48 px (default). Touch targets ≥ 40 px on tablet.

### Borders and radius

- Radius from `--radius: 0.625rem` (10 px) for cards and inputs; 6 px for badges and chips. Avoid fully rounded "pill" cards.
- 1 px borders using `--border`. Prefer borders over shadows to separate surfaces.

### Shadows

- Minimal: only for popovers, dialogs, and the sheet. Cards are flat on `--card`.

### Icons

- **lucide-react** only (already the shadcn icon library). Stroke 1.5–2 px. Size 16 px in tables, 20 px in headers.

### Motion

- Duration 150–200 ms, ease-out. Transitions only for: sheet/drawer open, decision badge change, row highlight on live update, skeleton shimmer.
- Honour `prefers-reduced-motion` by disabling shimmer and transforms.
- No bouncing, parallax, or continuous animation.
- Framer Motion is **not** needed for this scope. CSS transitions and `tw-animate-css` are enough. Revisit only for the simulator.

### Charts

Only charts that answer a question (see section 14). Use Recharts (already installed) and the `chart-1..5` tokens. Never use chart colours to encode decision state; use the decision badge components.

### Tables

- Sticky header, sortable only where the backend supports it (audit: timestamp only).
- Monospace columns for IDs and resources. Truncate with copy-on-click for `requestId`.
- Decision and tier columns are the first visual column after the timestamp.
- Keyboard: arrow keys move focus; Enter opens the detail sheet.

### Badges

- Built on the existing `Badge` primitive. Add `DecisionBadge`, `RiskTierBadge`, `AuthorizationBadge`, `SensitivityBadge` wrappers in `components/security/`.

### States (every data view must implement all)

| State | Requirement |
|---|---|
| Loading | Skeleton that matches the final layout |
| Empty | Explains what would populate the view and how (e.g. "No gateway requests yet. Send one with `POST /api/v1/gateway/evaluate`.") |
| Success | Normal rendering |
| Warning | Fallback states such as `riskEngineAvailable=false` |
| Error | Shows the backend `ErrorResponse.message`, with retry |
| Unauthorized | 401/403 → prompt to unlock with an admin key, not a blank page |
| Rate limited | **Not implemented on the backend.** Design the state, but do not trigger it. |
| Offline / network | Distinct from backend error. Shows a banner, keeps the last data visible. |

---

## 10. Information Architecture

### Recommended navigation (sidebar)

1. **Activity** — gateway audit feed (what happened)
2. **Reviews** — human-in-the-loop queue (what needs a person)
3. **Agents** — identities, status, key rotation
4. **Tools** — registry and status
5. **Permissions** — who can use what (per agent)
6. *(Later)* **Overview** — posture summary
7. *(Later)* **Risk** — factor explainer and analytics
8. *(Later)* **Simulator** — run scenarios
9. **Settings** — admin key session, environment info

Topbar: environment label (from config, not hard-coded), admin session state, and a global "Unlock / lock" control.

### Deliberately excluded

- A "Security Events" page separate from Activity. Audit rows *are* the events today. Splitting them now would duplicate data.
- A "Trajectory" page. No backend exists.
- A "Models" or "Playground" page. Not in the product.

---

## 11. Page Roadmap

Priority order, based on what the backend can already serve:

| Priority | Page | Why now | Backend ready? |
|---|---|---|---|
| 1 | **Activity** (audit list + filters + decision detail sheet) | Read-only, highest signal, exercises the whole data model, forces the admin unlock flow to be built correctly | **Yes** |
| 2 | **Reviews** (queue, detail, start/approve/reject) | Core product differentiator (human oversight). Only write action in the first wave. | Yes (attribution gap noted) |
| 3 | **Agents** (list, detail, suspend/revoke, rotate key) | Operator needs identity management. Key is shown once: needs careful UX. | Yes |
| 4 | **Tools & Permissions** (registry + grants) | Completes the access-control story | Yes (no list-all-permissions) |
| 5 | **Overview** | Requires aggregation API. Build only after the endpoint exists. | **No** — BACKEND SUPPORT REQUIRED |
| 6 | **Risk explainer** (factor breakdown per request) | Shows the Risk Engine's value | **No** — BACKEND SUPPORT REQUIRED (read API for `risk_assessments`) |
| 7 | **Simulator** | Demo and evaluation tool | Partly — `simulator/simulator.py` exists; its runnable status was **not verified** in this audit |
| 8 | Trajectory / ML risk views | Future backend work | **No** |

---

## 12. Backend Dependency Matrix

Legend: **Yes** = usable today. **BSR** = `BACKEND SUPPORT REQUIRED`.

| Feature | Backend API exists? | API | Frontend work | Backend work |
|---|---|---|---|---|
| Admin key unlock | Admin auth exists | Any `/api/v1/agents` (probe) | Unlock dialog, session handling, 401 state | None (but see sessionStorage concern) |
| Activity list + filters | **Yes** | `GET /api/v1/audit` | Table, filters, pagination, empty/error states | None |
| Decision detail | **Yes** | `GET /api/v1/audit/{requestId}` | Sheet with reason, authorization, decision | None for basic detail |
| Risk contribution on detail | **BSR** | Needs `GET /api/v1/risk-assessments/{requestId}` (reads `risk_assessments`) | Factor list, engine availability | New read endpoint + DTO |
| Riskier-tier filter on Activity | **BSR** | Needs `riskTier` on audit row or `GET /api/v1/audit?riskTier=` | Filter control | Add column/filter to audit (join or denormalise) |
| Review queue by status | **Yes** | `GET /api/v1/reviews?status=` | Tabs per status, counts from list length | None (pagination would help later) |
| Review detail | **Yes** | `GET /api/v1/reviews/{id}` | Detail sheet | None |
| Start / approve / reject | **Yes** | `POST /api/v1/reviews/{id}/{start,approve,reject}` | Confirm dialogs, optimistic status update | Add reviewer identity field (**BSR** for attribution) |
| Pending review count badge | **Partial** | Use `GET /reviews?status=PENDING` and count client-side | Badge in nav | Count endpoint would be cleaner — **BSR** (optional) |
| Agent list | **Yes** | `GET /api/v1/agents` | Table, status badge | Pagination later (optional) |
| Agent detail | **Yes** | `GET /api/v1/agents/{id}` | Detail page | None |
| Suspend / revoke / reactivate | **Yes** | `PATCH /api/v1/agents/{id}/status` | Status control with confirm | None |
| Rotate key (show once) | **Yes** | `POST /api/v1/agents/{id}/rotate-key` | Show-once panel, copy, clear on close | None |
| Register agent (show once) | **Yes** | `POST /api/v1/agents` | Form + show-once panel | None |
| Agent activity / last seen | **BSR** | Needs `lastSeenAt` or activity summary | Column and empty state | Add field or aggregate |
| Tool list / register / status | **Yes** | `/api/v1/tools`, `/api/v1/tools/{id}/status` | Table, forms, status control | None |
| Permissions per agent | **Yes** | `GET /api/v1/permissions/agent/{agentId}` | Matrix for one agent | None |
| Permission matrix (all agents × tools) | **BSR** | Needs list-all or matrix endpoint | Matrix view | New endpoint |
| Grant / revoke permission | **Yes** | `POST /api/v1/permissions`, `DELETE /api/v1/permissions/{id}` | Editor with action checkboxes | None |
| Overview KPIs (counts by decision, window) | **BSR** | Needs `GET /api/v1/analytics/decisions?from&to` (target in product-requirements) | Stat tiles, no fake numbers | New aggregation endpoint |
| Risk distribution | **BSR** | Needs `GET /api/v1/analytics/risk-distribution` | Histogram by tier | New aggregation endpoint |
| Denials by authorization reason | **BSR** | Aggregate over audit `authorizationResult` | Bar list | New aggregation endpoint |
| Trends over time | **BSR** | Time-bucketed decision counts | Line/area chart | New aggregation endpoint |
| Top high-risk resources | **BSR** | Aggregate over audit by resource | Ranked list | New aggregation endpoint |
| Risk factor catalogue | **BSR** | `GET /api/v1/risk/factors` (target) | Explainer page | Expose engine definitions (Java or Python proxy) |
| Simulator runs | **Partial** | `simulator/simulator.py` exists; no API | Scenario picker, run log | Decide: CLI-only or `/api/v1/simulator/*` |
| Live updates | **BSR** | No SSE/WebSocket; polling only | Polling with refetch interval | Optional SSE endpoint later |
| Multi-operator attribution | **BSR** | No operator identity | Show "by" column | Per-operator keys or identity (out of scope now) |
| Session-level risk | **BSR** | Not implemented | — | Trajectory phase |

---

## 13. Git Branch Roadmap

```
main
  │
  ├─ feature/ui-product-plan   ← this audit (docs only, do not merge code here)
  │       │
  │       └─ PR → main (docs only)
  │
  ├─ feature/activity-explorer   ← FIRST FEATURE (see §14)
  │       │  app shell + admin unlock + Activity list + decision detail
  │       └─ PR → main
  │
  ├─ feature/reviews
  │       └─ PR → main
  │
  ├─ feature/agents
  │       └─ PR → main
  │
  ├─ feature/tools-permissions
  │       └─ PR → main
  │
  ├─ feature/backend-risk-read          ← backend-only, unblocks the Risk explainer
  │       └─ PR → main
  │
  ├─ feature/risk-explainer
  │       └─ PR → main
  │
  ├─ feature/backend-analytics          ← backend-only
  │       └─ PR → main
  │
  ├─ feature/overview-dashboard
  │       └─ PR → main
  │
  ├─ feature/security-simulator
  ├─ feature/trajectory-analysis
  └─ feature/ml-risk-analysis
```

Notes:

- Each feature branch cuts from current `main` and merges by PR. No direct commits to `main`.
- Backend-only branches come before the frontend features that depend on them.
- `feature/dashboard` from the brief is replaced by `feature/activity-explorer` + `feature/overview-dashboard`, because a dashboard without aggregation endpoints would show invented numbers.

---

## 14. First Feature Recommendation

### Recommendation: **Activity explorer** (`feature/activity-explorer`)

A read-only list of gateway decisions from `GET /api/v1/audit`, with filters (agent, decision, authorization result, time range), pagination, and a detail sheet from `GET /api/v1/audit/{requestId}`. The feature includes the minimum app shell and the admin unlock flow it needs.

### Why this first

1. **Zero backend changes.** Both endpoints exist, are tested, and are filtered server-side.
2. **Highest product signal.** It shows the gateway's core output: every ALLOW, REVIEW, and DENY, with reason and authorization result. This is what the product sells.
3. **Forces the foundations to be right.** It builds the app shell, the admin unlock flow, the decision badge components, and the empty/loading/error/unauthorized states. Every later page reuses them.
4. **Surfaces the sessionStorage decision early**, while the stakes are low and the feature is read-only.
5. **Lower risk than writes.** Reviews and agents mutate state; this does not.
6. **Honest scope.** It does not need analytics or risk read APIs, so it cannot show invented data.

### Scope (for the next step, not implemented now)

- Replace `app/page.tsx` with a redirect to `/activity` (or an unlock screen when no key is set).
- `app/unlock/` admin key entry, with clear dev-only labelling.
- `(console)` layout: sidebar with Activity, Reviews, Agents, Tools, Permissions, Settings (only Activity active).
- `/activity` list, filters in the URL, pagination, all six states.
- `components/security/DecisionBadge`, `AuthorizationBadge`.
- Detail sheet at `/activity/[requestId]` or as a drawer.
- Tests: Vitest + React Testing Library for badge mapping and filter serialization. One Playwright smoke test against a running backend, if the team sets one up.

### Explicit non-goals for that branch

- No overview, no charts, no analytics.
- No write actions.
- No risk factor display (waits for the read API).
- No changes to the backend.

---

## Verification (this audit)

| Check | Command | Result |
|---|---|---|
| Git state | `git branch --show-current`, `git status --short` | On `feature/ui-product-plan`. One staged file: `frontend/.env.example`. No other changes before this report. |
| Risk Engine tests | `python3 -m pytest -q -p no:cacheprovider` in `risk-engine/` | **43 passed** |
| Frontend type check | `npx tsc --noEmit` in `frontend/` | **Not verified.** Ran for over 10 minutes with no output and was stopped. Cause not identified. |
| Frontend lint | `npx eslint` in `frontend/` | **Not verified.** Crashed with `ETIMEDOUT: connection timed out, read` while loading `node_modules/ajv`. Looks like a local filesystem or sync issue, not a code error. Needs a rerun on a clean `node_modules`. |
| Backend tests | Not executed. CI workflow `backend-ci.yml` runs Maven build and test. Integration tests need PostgreSQL. | **Not verified in this audit** |
| Frontend tests | None exist | N/A |

Files inspected (read-only): `CLAUDE.md`, `README.md`, `AGENTS.md`, `frontend/AGENTS.md`, `frontend/CLAUDE.md`, `docs/architecture.md`, `docs/product-requirements.md` (excerpts), `docs/risk-engine.md` (excerpt), `docker-compose.yml`, `.github/workflows/*` (names and steps), all backend controllers, `GatewayService`, `GatewayController`, `DecisionEscalator`, `EvaluationRequest/Response`, `AuditLogResponse`, `AgentCreateResponse`, `SecurityConfig`, `application.properties`, `HttpRiskEngineClient`, `RiskAssessmentService`, Flyway migration file list and index/table statements, `risk-engine/main.py`, `scoring.py`, `requirements.txt`, frontend `package.json`, `next.config.ts`, `tsconfig.json`, `components.json`, `globals.css`, `layout.tsx`, `page.tsx`, `providers.tsx`, `lib/api/*`, `lib/auth/admin-key.tsx`, `lib/utils.ts`, `types/api.ts`, `components/ui/badge.tsx`, `.env.example`.

Not read in depth: `simulator/simulator.py`, the full `architecture.md` (only status and overview), backend test bodies beyond names, `risk-engine/test_*.py` contents.
