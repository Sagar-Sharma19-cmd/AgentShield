# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the operator / security reviewer.** This is a security engineer or platform operator working in the AgentShield console. Their jobs:

- watch the decisions the gateway is making
- triage REVIEW items before they expire (default TTL is 30 minutes)
- investigate why a request was escalated or denied
- manage agents (register, rotate keys, suspend, revoke), tools and agent-tool grants

They often work under time pressure: an agent or a CI pipeline is blocked and waiting on their decision.

**Secondary audiences, in priority order:**

1. **Agent developer.** Wires an agent or a CI pipeline into the gateway. Needs clear deny reasons, fast setup, the simulator and the Python SDK / `agentshield-guard`.
2. **Platform / DevOps engineer.** Runs the gateway. Cares about fail-safe behaviour, health and deployment.
3. **Student / researcher and MCA evaluators.** Use AgentShield as a testbed. Need decisions whose factors can be inspected and explained.

## Product Purpose

AgentShield is a runtime security gateway for AI agents. Before an agent touches a protected tool, its tool call goes through a checkpoint, and the checkpoint returns ALLOW, REVIEW or DENY. Every decision is audited with its reason. Requests that a deterministic rule cannot settle go to a human for review.

Success means an operator can always answer two questions within seconds, and act on the answer:

- What is this agent allowed to do?
- What did it just try to do, and why was it allowed, held or blocked?

## Positioning

AgentShield is presented as a credible SaaS product and is also an MCA research project. Both identities are true at the same time.

What sets it apart is that the decision hierarchy is explainable and escalate-only:

1. Authentication
2. Permission engine
3. Policy engine
4. Risk engine (escalation only)
5. Trajectory analysis (escalation only)
6. Human review

Each stage after the permission engine can only tighten a decision, never grant access. Each decision records which stage changed the outcome. Approvals are bound to signed, one-time decision tokens: a guarded command runs only after the token is redeemed.

Never invent customers, pricing, testimonials, adoption figures or accuracy claims.

## Operating Context

- **Next.js operator console** with these pages:
  - Overview
  - Activity (audit trail)
  - Reviews (approve or reject with reviewer and note)
  - Agents (registration, one-time key display, lifecycle, grants)
  - Tools
  - CI/CD pipeline page with real Jenkins runs
  - Live alerts
  - Public welcome/landing page at `/welcome`
- **Agents and pipelines** call `POST /api/v1/gateway/evaluate`. The `agentshield-guard` CLI and the Python SDK redeem decision tokens before running a command. The simulator and `scripts/demo.sh` drive demos (see `docs/demo-guide.md`).
- **Authentication:**
  - Agents use their own API key.
  - Operators use a single admin API key. There is no per-operator RBAC.
  - The reviewer name is typed in. It is not an authenticated identity.

## Capabilities and Constraints

**Implemented:**

- agent identity lifecycle
- tool registry
- agent-tool grants
- deterministic PermissionEngine and PolicyEngine
- Risk Engine: Python, rule-based weighted factors, escalation only, fails safe to HIGH
- deterministic trajectory analysis over the last 10 requests of a session
- human review loop with claim
- signed one-time decision tokens
- content inspection of arguments, resources and tool output (V13)
- audit read API

**Not implemented.** The UI must never imply these exist:

- ML or learned scoring
- calibrated accuracy
- resource-impact / blast-radius analysis
- admin action audit trail
- rate limiting and auth lockout
- per-operator RBAC
- multi-tenancy
- billing and accounts

ML is planned as a shadow-mode model. When it lands, describe it only as shadow mode, together with its measured results.

Enforcement is cooperative. A command run without the guard is not stopped.

**Terminology** (use exactly):

- Decisions: ALLOW / REVIEW / DENY
- Risk tiers: LOW / MEDIUM / HIGH / CRITICAL
- Agent states: ACTIVE / SUSPENDED / REVOKED
- Tool states: ACTIVE / DISABLED
- Actions: READ / WRITE / DELETE / EXECUTE / EXTERNAL_REQUEST
- "escalated by": NONE / RISK_ENGINE / TRAJECTORY

**Stack (existing):** Next.js 16 App Router, React 19, Tailwind 4, shadcn/Radix, React Query, Recharts, next-themes, motion.

## Brand Commitments

- **Name:** AgentShield
- **Tagline in use:** "Runtime security for AI agents"
- **Voice:** precise, calm and factual. It states limitations plainly and does not overclaim.

## Evidence on Hand

- A real Jenkins pipeline (`Jenkinsfile`, `ci/jenkins/`) protected by `agentshield-guard`, including an ATTACK parameter that shows a policy DENY
- Simulator scenarios (`simulator/`)
- Demo script and guide (`scripts/demo.sh`, `docs/demo-guide.md`)
- Architecture, threat model, risk engine and research notes (`docs/`)
- Backend, risk-engine and frontend test suites, plus CI workflows

**Absent, so never fabricate:**

- customers or testimonials
- usage statistics
- benchmarks or detection accuracy
- pricing
- third-party security certifications

## Product Principles

1. **Explain every decision.** Every ALLOW, REVIEW or DENY shows its reason, the stage that decided it and the scores behind it.
2. **Fail closed, and say so.** When a signal is unavailable, the UI makes the fail-safe state visible rather than hiding it.
3. **Honest capability.** Describe the engines as deterministic and rule-based. Do not imply ML or a defence that does not exist, and name known limitations. Content inspection is pattern-based and must be described that way: never as "AI-powered", and never as a guarantee. The UI shows only the gateway's redacted previews, never raw secrets or PII.
4. **Reviewer time is the scarce resource.** Pending, actionable reviews and their expiry outrank everything else.
5. **Product-grade, research-legible.** Build to the standard of a real SaaS console, while keeping its mechanisms inspectable for research and evaluation.

## Accessibility & Inclusion

- **WCAG 2.2 AA is a hard requirement.** This covers contrast, full keyboard operation, visible focus and screen-reader labels.
- **Never show security state by colour alone.** Decisions and risk tiers always pair an icon, a label and a tone.
- **Dark and light themes are both first-class,** with equal quality and contrast.
- **Respect `prefers-reduced-motion`.**
