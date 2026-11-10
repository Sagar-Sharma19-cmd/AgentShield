package com.agentshield.config;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Instant;

/** Replaces the application clock with a {@link MutableClock} for tests that control time. */
@TestConfiguration
public class MutableClockConfig {

    @Bean
    @Primary
    public MutableClock mutableClock() {
        return new MutableClock(Instant.now());
    }
}
