import type { ActionType } from "@/types/api";

/**
 * Static description of the M4.1 simulator, mirrored from simulator/scenarios.py and simulator/mock_tools.py.
 * The page uses it to describe the demo. It is not a result: outcomes come only from recorded audit rows.
 * If a scenario changes in the simulator, update this file too.
 */

export interface MockTool {
  /** Tool name as sent in the gateway request (EvaluationRequest.tool). */
  name: string;
  /** What the mock does. Every mock writes one line to a temporary log and contacts nothing. */
  summary: string;
  /** Grants the demo agent needs for this tool (see the simulator README). */
  requiredActions: ActionType[];
}

export const MOCK_TOOLS: readonly MockTool[] = [
  { name: "github", summary: "Reads repository build metadata. No network call.", requiredActions: ["READ"] },
  { name: "filesystem", summary: "Reads a file. Nothing is opened.", requiredActions: ["READ"] },
  { name: "jenkins", summary: "Triggers a build job. No Jenkins contact.", requiredActions: ["EXECUTE"] },
  { name: "shell", summary: "Runs a harmless healthcheck. No process is started.", requiredActions: ["EXECUTE"] },
  { name: "docker", summary: "Builds and pushes a simulated image. No daemon or registry contact.", requiredActions: ["WRITE", "EXTERNAL_REQUEST"] },
  { name: "kubernetes", summary: "Applies or deletes a simulated resource. No cluster contact.", requiredActions: ["WRITE", "DELETE"] },
];

export interface PipelineStep {
  tool: string;
  action: ActionType;
  resource: string;
  summary: string;
}

export interface PipelineScenario {
  /** Scenario key, as passed to `simulator.py --scenario`. */
  id: string;
  /**
   * Scenario.pipeline_name in simulator/scenarios.py. The simulator's session ids are
   * "ci-<slug of this>-<12 hex>" (enforcement.new_session_id), so this is how a run is matched to its scenario.
   */
  pipelineName: string;
  title: string;
  description: string;
  steps: PipelineStep[];
  /**
   * The outcome the simulator's comments say PolicyEngine should produce. It is a documented expectation,
   * shown beside the steps and never presented as what happened.
   */
  documentedExpectation: string;
}

export const PIPELINE_SCENARIOS: readonly PipelineScenario[] = [
  {
    id: "basic_read_write",
    pipelineName: "build-staging",
    title: "Build staging",
    description: "Read build metadata, then build a staging image.",
    steps: [
      { tool: "github", action: "READ", resource: "agentshield/repo/build-info", summary: "Read build information" },
      { tool: "docker", action: "WRITE", resource: "docker/agentshield-api:staging-1", summary: "Build a staging image" },
    ],
    documentedExpectation: "Both steps are expected to be allowed when the grants are in place.",
  },
  {
    id: "credential_access",
    pipelineName: "leak-attempt",
    title: "Credential access",
    description: "Attempts to read a local environment file.",
    steps: [{ tool: "filesystem", action: "READ", resource: ".env", summary: "Read a local environment file" }],
    documentedExpectation: "Expected to be denied: the grant allows READ, but PolicyEngine denies secret resources.",
  },
  {
    id: "review_required",
    pipelineName: "trigger-build",
    title: "Trigger build and healthcheck",
    description: "Triggers a build and runs a healthcheck.",
    steps: [
      { tool: "jenkins", action: "EXECUTE", resource: "jenkins/job/agentshield-build", summary: "Trigger a build" },
      { tool: "shell", action: "EXECUTE", resource: "shell/healthcheck-echo", summary: "Run a healthcheck" },
    ],
    documentedExpectation: "Expected to go to review: PolicyEngine sends every EXECUTE to REVIEW.",
  },
  {
    id: "deployment_pipeline",
    pipelineName: "deploy-staging",
    title: "Deploy staging",
    description: "Build, push to a registry, then apply the deployment.",
    steps: [
      { tool: "github", action: "READ", resource: "agentshield/repo/build-info", summary: "Read build information" },
      { tool: "docker", action: "WRITE", resource: "docker/agentshield-api:staging-1", summary: "Build a staging image" },
      {
        tool: "docker",
        action: "EXTERNAL_REQUEST",
        resource: "registry.staging.example.test/agentshield-api",
        summary: "Push to an external registry",
      },
      { tool: "kubernetes", action: "WRITE", resource: "k8s/staging/agentshield-deployment", summary: "Apply the deployment" },
    ],
    documentedExpectation: "The push is expected to go to review, and the pipeline halts there by default.",
  },
  {
    id: "scope_escalation",
    pipelineName: "cleanup-canary",
    title: "Clean up canary",
    description: "Applies a staging deployment, then deletes a canary.",
    steps: [
      { tool: "kubernetes", action: "WRITE", resource: "k8s/staging/agentshield-deployment", summary: "Apply the deployment" },
      { tool: "kubernetes", action: "DELETE", resource: "k8s/staging/agentshield-canary", summary: "Delete the canary" },
    ],
    documentedExpectation: "The non-production DELETE is expected to go to review.",
  },
];

/**
 * The exact command for one scenario, run from simulator/. --wait-for-review keeps a REVIEW step open until an
 * operator decides in Reviews, so the run can be followed here live.
 */
export function simulatorRunCommand(scenario: Pick<PipelineScenario, "id">): string {
  return `python3 simulator.py --scenario ${scenario.id} --wait-for-review`;
}

/** One-time setup and shell environment for a run (scripts/demo.sh writes the agent key to that file). */
export const SIMULATOR_SETUP_COMMANDS = ["scripts/demo.sh setup", "source ~/.agentshield-demo/env", "cd simulator"] as const;

/* ---------------------------------------------------------------------------------------------- */
/* Real pipeline (E2): Jenkins with agentshield-guard. See ci/jenkins/README.md.                     */

/** The agent scripts/setup-ci-agent.sh registers for the Jenkinsfile. */
export const JENKINS_CI_AGENT = "jenkins-ci-agent";
export const JENKINS_JOB_NAME = "agentshield-guarded-deploy";
export const JENKINS_URL = "http://localhost:8080";

/** One-time setup from the repository root, with the admin key in the shell (ci/jenkins/README.md). */
export const JENKINS_SETUP_COMMANDS = ["scripts/setup-ci-agent.sh", "ci/jenkins/setup-local-infra.sh"] as const;

const AGENT_FRIENDLY_LABELS: Readonly<Record<string, string>> = { [JENKINS_CI_AGENT]: "Jenkins" };

/** A friendly label for a known agent name (e.g. "Jenkins"), or null. The name itself is always shown too. */
export function agentFriendlyLabel(name: string): string | null {
  return Object.hasOwn(AGENT_FRIENDLY_LABELS, name) ? AGENT_FRIENDLY_LABELS[name] : null;
}
