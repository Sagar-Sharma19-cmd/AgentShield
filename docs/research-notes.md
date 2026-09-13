# Research Notes

> **Status:** Living document — updated throughout the project.

---

## Key Problem Statement

AI agents are increasingly given access to external tools: file systems, APIs, databases, code execution environments, and cloud resources. These agents operate autonomously and can take consequential actions without human intervention. The current state of AI safety research focuses primarily on model alignment and output filtering, but does not address **runtime enforcement of tool-use boundaries**.

AgentShield addresses the gap: a runtime security gateway that enforces what an agent may *do*, not just what it may *say*.

---

## Related Work and Concepts

> Note: These are directions for literature review. No specific papers are cited yet — citations will be added as research progresses.

### 1. Tool-Use in LLM Agents
- ReAct (Reason + Act) — agents that interleave reasoning steps with tool calls
- Function calling in GPT-4, Claude, Gemini
- LangChain, LlamaIndex — agent frameworks that give LLMs tool access

### 2. AI Safety and Alignment
- Constitutional AI (Anthropic)
- RLHF — preference learning
- Scalable oversight — how do you supervise an agent smarter than you?

### 3. Runtime Security (Traditional)
- API Gateways (Kong, AWS API Gateway) — rate limiting, auth, routing
- Web Application Firewalls (WAF) — inspect HTTP requests
- RBAC / ABAC — role/attribute-based access control
- SIEM (Security Information and Event Management) — audit and anomaly detection

### 4. Prompt Injection
- Direct prompt injection — adversarial inputs in user messages
- Indirect prompt injection — adversarial content in data the agent reads
- Relevance: agents that process external data (web pages, files) can be hijacked

### 5. Anomaly Detection
- Isolation Forest — unsupervised anomaly detection
- Autoencoders for sequence anomaly detection
- One-class SVM

---

## Open Questions

1. What is the right granularity for a policy rule? (action + resource type, or fine-grained path matching?)
2. How do you define "normal" agent behaviour for anomaly detection?
3. Can risk scoring be done fast enough to not significantly slow agent task execution?
4. Should REVIEW decisions block the agent (synchronous) or proceed and alert (asynchronous)?
5. How does the system handle multiple agents running concurrently?
6. What is the right data model for storing agent behaviour trajectories?

---

## Key Design Decisions Made

| Decision | Rationale |
|----------|-----------|
| Risk engine is a separate Python service | Keeps ML/scoring independent from core gateway; easier to iterate |
| Decisions are: ALLOW / REVIEW / DENY | Three-tier system balances strictness with usability |
| All decisions are audit-logged | Required for forensics, debugging, and research |
| Agents never call tools directly | Core architectural constraint — all actions go through gateway |
| No hard-coded secrets | Environment variable configuration only |

---

## Notes for Future Phases

- Phase 5 simulator should generate realistic sequences of agent tool calls for testing.
- Phase 6 behaviour/trajectory evaluation needs a windowed view of recent actions per agent session.
- A "shadow mode" where the gateway logs decisions but doesn't block could be useful for calibrating thresholds.
