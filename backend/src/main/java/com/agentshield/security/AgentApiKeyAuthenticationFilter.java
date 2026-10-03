package com.agentshield.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * Authenticates gateway requests using an agent API key supplied in
 * {@code X-Agent-API-Key} or {@code Authorization: Bearer <key>}.
 *
 * Not a Spring bean on purpose: it is registered only in the gateway security filter chain.
 * API keys are never logged.
 */
public class AgentApiKeyAuthenticationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Agent-API-Key";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final Logger log = LoggerFactory.getLogger(AgentApiKeyAuthenticationFilter.class);

    private final AgentApiKeyAuthenticator authenticator;
    private final AuthenticationEntryPoint entryPoint;

    public AgentApiKeyAuthenticationFilter(AgentApiKeyAuthenticator authenticator, AuthenticationEntryPoint entryPoint) {
        this.authenticator = authenticator;
        this.entryPoint = entryPoint;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String headerKey = request.getHeader(HEADER);
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        String bearerKey = authorization != null && authorization.startsWith(BEARER_PREFIX)
                ? authorization.substring(BEARER_PREFIX.length()).trim()
                : null;

        if (headerKey == null && bearerKey == null) {
            // Unauthenticated: the authorization rules reject the request via the entry point
            chain.doFilter(request, response);
            return;
        }
        if (headerKey != null && bearerKey != null && !headerKey.equals(bearerKey)) {
            reject(request, response, "conflicting credentials in X-Agent-API-Key and Authorization headers");
            return;
        }

        String rawKey = headerKey != null ? headerKey : bearerKey;
        Optional<AuthenticatedAgent> agent = authenticator.authenticate(rawKey);
        if (agent.isEmpty()) {
            reject(request, response, "invalid, revoked or unknown agent API key");
            return;
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                agent.get(), null, List.of(new SimpleGrantedAuthority("ROLE_AGENT"))));
        SecurityContextHolder.setContext(context);
        chain.doFilter(request, response);
    }

    private void reject(HttpServletRequest request, HttpServletResponse response, String reason)
            throws IOException, ServletException {
        log.warn("Rejected gateway request to {} from {}: {}", request.getRequestURI(), request.getRemoteAddr(), reason);
        SecurityContextHolder.clearContext();
        entryPoint.commence(request, response, new BadCredentialsException(reason));
    }
}
