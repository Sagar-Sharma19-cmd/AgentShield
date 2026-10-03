package com.agentshield.security;

import java.util.UUID;

/**
 * Security principal for a gateway request authenticated with an agent API key.
 */
public record AuthenticatedAgent(UUID id, String name) {
}
