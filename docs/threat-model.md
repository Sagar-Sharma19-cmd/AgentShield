# Threat Model

> **Status:** Partial. This document lists threats and planned controls. Only some controls exist.
> Implemented controls are described in `docs/architecture.md`. Deterministic trajectory analysis is
> implemented. It is escalate-only, not ML,
> and has the limits in [Trajectory Analysis: What It Does and Does Not Stop](#trajectory-analysis-what-it-does-and-does-not-stop).
> Resource-impact analysis is designed (`docs/resource-impact-design.md`) and is NOT implemented.

---

## Overview

This document describes the threat model for AgentShield. It identifies the assets being protected, the actors involved, attack scenarios, and the security controls that AgentShield aims to provide.

---

## Assets

| Asset | Description |
|-------|-------------|
| Source code repositories | Code that the agent may be able to read or modify |
| Credential and secret files | `.env`, API keys, tokens |
| Databases | Application data, user records |
| Cloud resource APIs | AWS, GCP, Azure resource management |
| File system | Arbitrary read/write access |
| External APIs | Third-party services the agent can call |

---

## Actors

| Actor | Description |
|-------|-------------|
| Legitimate AI Agent | A properly configured agent operating within its defined scope |
| Compromised Agent | An agent whose instructions have been hijacked (e.g., via prompt injection) |
| Malicious Prompt | A crafted user input that causes the agent to attempt unsafe actions |
| Internal Operator | A human reviewing or overriding agent decisions |

---

## Attack Scenarios (Planned Analysis)

### 1. Prompt Injection → Credential Exfiltration
An adversarial input causes the agent to attempt reading `.env` or credential files and sending contents to an external endpoint.

**AgentShield control:** Policy denies READ on credential file patterns. Risk score is high. Action is DENY.

### 2. Scope Creep
An agent authorised to read a repository gradually attempts to write to it, then delete files.

**Planned intent:** Policy permits READ only, and WRITE/DELETE would be DENIED.
**Current behaviour (not this planned control):** PolicyEngine returns ALLOW for WRITE (score 20) and REVIEW for non-production DELETE (60). Production DELETE is DENIED (95). A WRITE to a non-secret resource is limited only by the `AgentToolPermission` grant, and secret/credential resources are DENIED by a separate rule. See `docs/architecture.md`.

### 3. Data Exfiltration via API Call
An agent attempts to POST internal data to an external HTTP endpoint not on the allow-list.

**AgentShield control:** Outbound API calls checked against an allow-list. Unlisted domains are DENIED.

### 4. Privilege Escalation
An agent attempts to invoke admin-level operations beyond its assigned role.

**AgentShield control:** Policies are role-scoped. Elevated actions require REVIEW or are DENIED.

### 5. Anomalous Behaviour / Trajectory Attack
An agent performs a sequence of individually plausible actions that, taken together, constitute a dangerous trajectory (e.g., read config → read credentials → call external API).

**AgentShield control (partial):** Deterministic trajectory analysis over the last 10 requests of the same
session and verified agent. It can escalate an ALLOW to REVIEW at HIGH or CRITICAL tier. It cannot block,
and for the exact sequence above it has limited effect. See the next section.

---

## Trajectory Analysis: What It Does and Does Not Stop

Implemented in `backend/.../trajectory/` and described in `docs/architecture.md` (Trajectory Analysis).

**What it can do**

- Raise an ALLOW to REVIEW when the same session's recent history reaches HIGH tier (60 or more). This
  puts a human in the loop. It never blocks on its own.
- Record a separate trajectory score, tier and reason on every evaluated request, and attribute the
  escalation (`audit_logs.escalated_by = TRAJECTORY`), so an operator can see what caused it.
- Fail open to the existing decision. If the history lookup or evaluator fails, the request keeps its
  decision and is recorded as "not evaluated". `Error`s are never swallowed.

**What it does not do, or does only partly**

- **It can only change READ and WRITE decisions.** PolicyEngine returns ALLOW only for READ and WRITE.
  Every other non-DENY outcome (DELETE, EXECUTE, EXTERNAL_REQUEST) is already REVIEW, and trajectory
  never changes a REVIEW. The `ACTION_ESCALATION` and `SENSITIVE_READ_THEN_EGRESS` factors therefore
  add to the recorded score of already-REVIEW requests, but they cannot change a decision. The
  read-config → read-credentials → call-external-API example above is one of these cases: its external
  request is already REVIEW under policy, so trajectory records a score but cannot escalate it.
- **For a READ or WRITE, the highest possible trajectory score is 60.** That score needs at least 3
  prior denials in the window, at least 5 events in the last 60 seconds, and at least 4 distinct tools.
  Anything less stays below HIGH and does not escalate.
- **Cooperative enforcement.** Trajectory sees only requests that reach the gateway. A tool the agent
  calls directly, with no gateway call, produces no history at all.
- **Bounded window.** Only the last 10 audit rows for the session are read. Older activity is invisible.
- **Client-supplied session identity.** `sessionId` is supplied by the agent. An agent that changes its
  session ID starts with an empty history. History is scoped to the verified agent, so another agent's
  sessions are never read, but a single agent can evade its own history by rotating session IDs.
- **Deterministic rules, not ML.** Points and thresholds are fixed and not calibrated against labelled
  data. No detection rate or false-positive rate is claimed.
- **Concurrency.** Requests in one session that run at the same time may not see each other.
- **Unauthenticated requests are not audited.** A 401 never enters any session's history.
- **Alert delivery is pull-based.** The admin console learns of escalations by polling the audit API
  every 10 seconds. There is no push delivery, so the console can lag.
- **Simulator tools are mocks.** Any scenario run through the M4.1 simulator
  uses mock tools. Nothing it does touches real infrastructure, so it proves the gateway's decisions,
  not the effect of a real tool call.

## Trust Boundaries

```
[Untrusted Zone]
    AI Agent (may have been manipulated)
        │
    ════════════════════════ AgentShield Boundary ════════
        │
[Trusted Zone]
    Protected Tools, APIs, Databases, File System
```

AgentShield is the only crossing point between the untrusted agent zone and the trusted resource zone.

---

## Out of Scope (Current Phase)

- Network-level intrusion detection
- Container escape prevention
- Model weight poisoning
- Formal verification of policies
