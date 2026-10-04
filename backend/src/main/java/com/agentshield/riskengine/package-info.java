/**
 * Java-side integration with the standalone Python Risk Engine (risk-engine/).
 *
 * The Risk Engine provides a risk signal only: it does not grant authorization and can only
 * escalate (never downgrade) a decision already reached by PermissionEngine/PolicyEngine.
 * See {@link com.agentshield.gateway.DecisionEscalator} for the escalation rules and
 * {@code docs/architecture.md} / {@code docs/risk-engine.md} for the full design.
 */
package com.agentshield.riskengine;
