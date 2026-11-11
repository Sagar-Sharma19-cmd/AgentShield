/**
 * Content for the public /welcome page. Everything here is grounded in the project: verdicts follow
 * PolicyEngine and the demo grants (simulator/scenarios.py), stage lines follow docs/architecture.md, and
 * scenario outcomes are the ones documented in simulator/README.md and docs/demo-guide.md. No invented
 * people, companies, quotes or metrics. Pure data plus the face-mode mapping; tested in content.test.ts.
 */
import type { DecisionType } from "@/types/api";
import type { TypingItem } from "./typing";

export interface PromptExample extends TypingItem {
  decision: DecisionType;
}

/** Requests typed into the intro prompt box, each with the verdict AgentShield gives it. */
export const PROMPT_EXAMPLES: readonly PromptExample[] = [
  {
    request: "READ filesystem /app/.env",
    verdict: "DENY · Policy: credential and secret resources are blocked",
    decision: "DENY",
  },
  { request: "WRITE docker images/api:staging", verdict: "ALLOW · within permitted policy bounds", decision: "ALLOW" },
  { request: "EXECUTE jenkins job/build", verdict: "REVIEW · execution needs a human", decision: "REVIEW" },
  { request: "DELETE shell /tmp/cache", verdict: "DENY · Permission: never granted", decision: "DENY" },
];

export const INTRO_FEATURES: readonly { label: string; dim?: boolean }[] = [
  { label: "IDENTITY" },
  { label: "PERMISSION" },
  { label: "POLICY" },
  { label: "RISK ENGINE" },
  { label: "TRAJECTORY" },
  { label: "HUMAN REVIEW" },
  { label: "AND AUDIT", dim: true },
];

export interface PipelineStage {
  id: string;
  label: string;
  line: string;
}

/** The gateway stages in evaluation order (docs/architecture.md), one honest line each. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    id: "identity",
    label: "Identity",
    line: "Each agent authenticates with its own API key. The claimed agentId must match that key, and a suspended or revoked agent is denied.",
  },
  {
    id: "permission",
    label: "Permission",
    line: "An explicit grant must exist for this agent, tool and action, and both the tool and the grant must be enabled. No grant, no access.",
  },
  {
    id: "policy",
    label: "Policy",
    line: "Deterministic rules on action and resource: secrets and production DELETE are denied; EXECUTE, external calls and other DELETEs go to review.",
  },
  {
    id: "risk-engine",
    label: "Risk engine",
    line: "A separate scoring service can only escalate: HIGH turns an ALLOW into REVIEW, CRITICAL denies. It never relaxes a decision.",
  },
  {
    id: "trajectory",
    label: "Trajectory",
    line: "Reads the session's last 10 requests and can raise an ALLOW to REVIEW when the sequence looks risky. Rule-based, and it never blocks on its own.",
  },
  {
    id: "human-review",
    label: "Human review",
    line: "A REVIEW waits for an operator. An approval lets the agent run that exact request once, before the review expires.",
  },
  {
    id: "audit",
    label: "Audit",
    line: "Every evaluation is recorded with its decision, reason and deciding stage, and can be searched from the console.",
  },
];

export interface ScenarioStep {
  action: string;
  tool: string;
  resource: string;
}

export interface LandingScenario {
  id: string;
  title: string;
  command: string;
  steps: readonly ScenarioStep[];
  /** The documented final outcome of the run. */
  decision: DecisionType;
  /** Index into `steps` of the step that produced the outcome (the run halts there unless it is ALLOW). */
  decisiveStep: number;
  /** Stage that decided it, as named in the pipeline. */
  stage: string;
  explanation: string;
}

/** The five simulator scenarios and the trajectory demo, with their documented outcomes. */
export const LANDING_SCENARIOS: readonly LandingScenario[] = [
  {
    id: "basic_read_write",
    title: "Build a staging image",
    command: "python3 simulator.py --scenario basic_read_write",
    steps: [
      { action: "READ", tool: "github", resource: "agentshield/repo/build-info" },
      { action: "WRITE", tool: "docker", resource: "docker/agentshield-api:staging-1" },
    ],
    decision: "ALLOW",
    decisiveStep: 1,
    stage: "Policy",
    explanation: "Both steps are granted, and READ and WRITE on project resources are within permitted policy bounds.",
  },
  {
    id: "credential_access",
    title: "Read a .env file",
    command: "python3 simulator.py --scenario credential_access",
    steps: [{ action: "READ", tool: "filesystem", resource: ".env" }],
    decision: "DENY",
    decisiveStep: 0,
    stage: "Policy",
    explanation: "The grant allows READ, but credential and secret resources are denied by policy.",
  },
  {
    id: "review_required",
    title: "Trigger a build",
    command: "python3 simulator.py --scenario review_required",
    steps: [
      { action: "EXECUTE", tool: "jenkins", resource: "jenkins/job/agentshield-build" },
      { action: "EXECUTE", tool: "shell", resource: "shell/healthcheck-echo" },
    ],
    decision: "REVIEW",
    decisiveStep: 0,
    stage: "Policy",
    explanation: "Policy sends every EXECUTE to a human. The build waits until an operator approves it.",
  },
  {
    id: "deployment_pipeline",
    title: "Deploy to staging",
    command: "python3 simulator.py --scenario deployment_pipeline",
    steps: [
      { action: "READ", tool: "github", resource: "agentshield/repo/build-info" },
      { action: "WRITE", tool: "docker", resource: "docker/agentshield-api:staging-1" },
      { action: "EXTERNAL_REQUEST", tool: "docker", resource: "registry.staging.example.test/agentshield-api" },
      { action: "WRITE", tool: "kubernetes", resource: "k8s/staging/agentshield-deployment" },
    ],
    decision: "REVIEW",
    decisiveStep: 2,
    stage: "Policy",
    explanation: "Read and build pass. The push to the registry is an external request, so it goes to review and the pipeline halts there.",
  },
  {
    id: "scope_escalation",
    title: "Clean up a canary",
    command: "python3 simulator.py --scenario scope_escalation",
    steps: [
      { action: "WRITE", tool: "kubernetes", resource: "k8s/staging/agentshield-deployment" },
      { action: "DELETE", tool: "kubernetes", resource: "k8s/staging/agentshield-canary" },
    ],
    decision: "REVIEW",
    decisiveStep: 1,
    stage: "Policy",
    explanation: "The deployment is allowed. Deleting a non-production resource needs human review.",
  },
  {
    id: "trajectory",
    title: "A session that turns risky",
    command: "scripts/demo.sh trajectory",
    steps: [
      { action: "READ", tool: "filesystem", resource: "/app/.env" },
      { action: "READ", tool: "filesystem", resource: "/app/config/credentials.json" },
      { action: "READ", tool: "filesystem", resource: "/app/secrets/db_password" },
      { action: "READ", tool: "github", resource: "repo/agentshield/README.md" },
      { action: "WRITE", tool: "docker", resource: "images/agentshield-api:staging" },
      { action: "WRITE", tool: "kubernetes", resource: "k8s/staging/deployment.yaml" },
    ],
    decision: "REVIEW",
    decisiveStep: 5,
    stage: "Trajectory",
    explanation:
      "The final WRITE is allowed on its own. Its session history (3 denials, 4 tools, 6 requests in 60 s) is HIGH trajectory risk, so it is escalated to REVIEW.",
  },
];

/** What the robot's face screen shows. */
export type FaceMode = "idle" | "check" | "eye" | "barred";

const FACE_BY_DECISION: Record<DecisionType, FaceMode> = {
  ALLOW: "check",
  REVIEW: "eye",
  DENY: "barred",
};

/** Decision symbol for the face: check for ALLOW, eye for REVIEW, barred circle for DENY; idle otherwise. */
export function faceModeFor(decision: DecisionType | null | undefined): FaceMode {
  return decision ? FACE_BY_DECISION[decision] : "idle";
}

export const LANDING_SECTIONS = ["intro", "product", "scenarios"] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];

export const LANDING_SECTION_LABELS: Record<LandingSection, string> = {
  intro: "INTRO",
  product: "PRODUCT",
  scenarios: "SCENARIOS",
};

/** The face follows the selected scenario only while the scenarios section is active. */
export function faceModeForSection(section: LandingSection, scenarioDecision: DecisionType | null): FaceMode {
  return section === "scenarios" ? faceModeFor(scenarioDecision) : "idle";
}

export const SOURCE_URL = "https://github.com/Sagar-Sharma19-cmd/AgentShield";
