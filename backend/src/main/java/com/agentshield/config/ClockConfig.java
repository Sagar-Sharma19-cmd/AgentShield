package com.agentshield.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * The application clock. Services that make time-based decisions (review expiry) take a {@link Clock}
 * instead of calling {@code Instant.now()}, so tests can control time without sleeping.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
