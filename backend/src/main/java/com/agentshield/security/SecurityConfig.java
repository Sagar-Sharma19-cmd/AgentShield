package com.agentshield.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

/**
 * Spring Security configuration: three stateless filter chains.
 *
 * 1. Gateway  (/api/v1/gateway/**)                        — agent API key, ROLE_AGENT
 * 2. Admin    (/api/v1/agents|tools|permissions|reviews/**) — admin API key, ROLE_ADMIN
 *    (the human review workflow is an operator action, so it reuses the admin chain
 *    rather than introducing a new authentication/authorization mechanism)
 * 3. Default  — health/info and error dispatch are public; everything else is denied
 *
 * Agent keys are never accepted on admin endpoints and vice versa.
 * CSRF is disabled because authentication is header-based (no cookies or browser sessions).
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    @Order(1)
    public SecurityFilterChain gatewaySecurityFilterChain(HttpSecurity http,
                                                          AgentApiKeyAuthenticator authenticator,
                                                          ObjectMapper objectMapper) throws Exception {
        ApiKeyAuthenticationEntryPoint entryPoint =
                new ApiKeyAuthenticationEntryPoint(objectMapper, "Bearer realm=\"agentshield-gateway\"");

        return statelessApi(http)
                .securityMatcher("/api/v1/gateway/**")
                .authorizeHttpRequests(auth -> auth.anyRequest().hasRole("AGENT"))
                .addFilterBefore(new AgentApiKeyAuthenticationFilter(authenticator, entryPoint),
                        AnonymousAuthenticationFilter.class)
                .exceptionHandling(ex -> ex.authenticationEntryPoint(entryPoint))
                .build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain adminSecurityFilterChain(HttpSecurity http,
                                                        ObjectMapper objectMapper,
                                                        @Value("${agentshield.security.admin-api-key:}") String adminApiKey)
            throws Exception {
        ApiKeyAuthenticationEntryPoint entryPoint =
                new ApiKeyAuthenticationEntryPoint(objectMapper, "ApiKey realm=\"agentshield-admin\"");

        return statelessApi(http)
                .securityMatcher("/api/v1/agents/**", "/api/v1/tools/**", "/api/v1/permissions/**", "/api/v1/reviews/**")
                .authorizeHttpRequests(auth -> auth.anyRequest().hasRole("ADMIN"))
                .addFilterBefore(new AdminApiKeyAuthenticationFilter(adminApiKey, entryPoint),
                        AnonymousAuthenticationFilter.class)
                .exceptionHandling(ex -> ex.authenticationEntryPoint(entryPoint))
                .build();
    }

    @Bean
    @Order(3)
    public SecurityFilterChain defaultSecurityFilterChain(HttpSecurity http) throws Exception {
        return statelessApi(http)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info", "/error")
                        .permitAll()
                        .anyRequest().denyAll())
                .exceptionHandling(ex -> ex.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .build();
    }

    private HttpSecurity statelessApi(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    }
}
