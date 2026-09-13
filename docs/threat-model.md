# Threat Model

> **Status:** Placeholder — to be developed alongside policy engine implementation.

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

**AgentShield control:** Policy permits READ only. WRITE/DELETE actions are DENIED.

### 3. Data Exfiltration via API Call
An agent attempts to POST internal data to an external HTTP endpoint not on the allow-list.

**AgentShield control:** Outbound API calls checked against an allow-list. Unlisted domains are DENIED.

### 4. Privilege Escalation
An agent attempts to invoke admin-level operations beyond its assigned role.

**AgentShield control:** Policies are role-scoped. Elevated actions require REVIEW or are DENIED.

### 5. Anomalous Behaviour / Trajectory Attack
An agent performs a sequence of individually plausible actions that, taken together, constitute a dangerous trajectory (e.g., read config → read credentials → call external API).

**AgentShield control:** Trajectory evaluation (planned Phase 6) will flag suspicious sequences.

---

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
