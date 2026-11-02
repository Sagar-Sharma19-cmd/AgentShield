"""
Demo pipelines. Each operation is sent to AgentShield unchanged; the simulator never assumes
the outcome. The comments give the rule that PolicyEngine applies (backend/.../policy/PolicyEngine.java),
so a reader can see why a decision is expected. Verify against a live run, because the
registered grants and the Risk Engine tier can change the final decision.

Tools and grants required for these scenarios (see README "Register the simulated agent"):
  github      READ
  filesystem  READ
  jenkins     EXECUTE
  shell       EXECUTE
  docker      WRITE, EXTERNAL_REQUEST
  kubernetes  WRITE, DELETE
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from enforcement import Operation


@dataclass(frozen=True)
class Scenario:
    name: str
    description: str
    pipeline_name: str
    operations: List[Operation]


SCENARIOS: Dict[str, Scenario] = {
    "basic_read_write": Scenario(
        name="basic_read_write",
        description="Read build metadata, then build a staging image (READ, then WRITE).",
        pipeline_name="build-staging",
        operations=[
            Operation("github.read_build_info", "github", "READ", "agentshield/repo/build-info",
                      "Read repository build information"),
            Operation("docker.build_image", "docker", "WRITE", "docker/agentshield-api:staging-1",
                      "Build a simulated staging image"),
        ],
    ),
    "credential_access": Scenario(
        name="credential_access",
        description="Attempt to read a .env file. The grant allows READ, but PolicyEngine denies secret resources.",
        pipeline_name="leak-attempt",
        operations=[
            Operation("filesystem.read_file", "filesystem", "READ", ".env",
                      "Read a local environment file"),
        ],
    ),
    "review_required": Scenario(
        name="review_required",
        description="Trigger a build and run a healthcheck. PolicyEngine sends every EXECUTE to REVIEW.",
        pipeline_name="trigger-build",
        operations=[
            Operation("jenkins.trigger_build", "jenkins", "EXECUTE", "jenkins/job/agentshield-build",
                      "Trigger a simulated Jenkins build"),
            Operation("shell.healthcheck", "shell", "EXECUTE", "shell/healthcheck-echo",
                      "Run a harmless simulated healthcheck"),
        ],
    ),
    "deployment_pipeline": Scenario(
        name="deployment_pipeline",
        description="Multi-step staging deployment. Build, then push to a registry: an EXTERNAL_REQUEST, "
                    "which PolicyEngine sends to REVIEW. The pipeline halts there by default.",
        pipeline_name="deploy-staging",
        operations=[
            Operation("github.read_build_info", "github", "READ", "agentshield/repo/build-info",
                      "Read repository build information"),
            Operation("docker.build_image", "docker", "WRITE", "docker/agentshield-api:staging-1",
                      "Build a simulated staging image"),
            Operation("docker.push_image", "docker", "EXTERNAL_REQUEST",
                      "registry.staging.example.test/agentshield-api",
                      "Push the image to a simulated external registry"),
            Operation("kubernetes.apply", "kubernetes", "WRITE", "k8s/staging/agentshield-deployment",
                      "Apply a simulated staging deployment"),
        ],
    ),
    "scope_escalation": Scenario(
        name="scope_escalation",
        description="Apply a staging deployment (WRITE), then delete a canary (DELETE). PolicyEngine sends "
                    "non-production DELETE to REVIEW.",
        pipeline_name="cleanup-canary",
        operations=[
            Operation("kubernetes.apply", "kubernetes", "WRITE", "k8s/staging/agentshield-deployment",
                      "Apply a simulated staging deployment"),
            Operation("kubernetes.delete", "kubernetes", "DELETE", "k8s/staging/agentshield-canary",
                      "Delete a simulated canary resource"),
        ],
    ),
}
