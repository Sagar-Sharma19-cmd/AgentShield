package com.agentshield.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;

/**
 * Authenticates administrative requests using the {@code X-Admin-API-Key} header.
 *
 * Keys are compared as SHA-256 digests with {@link MessageDigest#isEqual}, which is
 * constant-time and independent of the supplied key's length. Keys are never logged.
 */
public class AdminApiKeyAuthenticationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Admin-API-Key";
    static final int MIN_ADMIN_KEY_LENGTH = 32;
    private static final Logger log = LoggerFactory.getLogger(AdminApiKeyAuthenticationFilter.class);

    private final byte[] expectedDigest;
    private final AuthenticationEntryPoint entryPoint;

    public AdminApiKeyAuthenticationFilter(String adminApiKey, AuthenticationEntryPoint entryPoint) {
        if (adminApiKey == null || adminApiKey.isBlank() || adminApiKey.length() < MIN_ADMIN_KEY_LENGTH) {
            // Never include the configured value in the message
            throw new IllegalStateException("agentshield.security.admin-api-key must be set to at least "
                    + MIN_ADMIN_KEY_LENGTH + " characters (environment variable AGENTSHIELD_ADMIN_API_KEY).");
        }
        this.expectedDigest = sha256(adminApiKey);
        this.entryPoint = entryPoint;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String providedKey = request.getHeader(HEADER);
        if (providedKey == null) {
            chain.doFilter(request, response);
            return;
        }
        if (!MessageDigest.isEqual(expectedDigest, sha256(providedKey))) {
            log.warn("Rejected admin request to {} from {}: invalid admin API key",
                    request.getRequestURI(), request.getRemoteAddr());
            SecurityContextHolder.clearContext();
            entryPoint.commence(request, response, new BadCredentialsException("Invalid admin API key"));
            return;
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                "admin", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        SecurityContextHolder.setContext(context);
        chain.doFilter(request, response);
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
