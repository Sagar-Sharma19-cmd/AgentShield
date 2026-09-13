package com.agentshield;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * AgentShield — Runtime Security Gateway for AI Agents.
 *
 * Entry point for the Spring Boot application.
 * All agent tool/action requests are evaluated through this gateway
 * before reaching protected resources.
 */
@SpringBootApplication
public class AgentShieldApplication {

    public static void main(String[] args) {
        SpringApplication.run(AgentShieldApplication.class, args);
    }
}
