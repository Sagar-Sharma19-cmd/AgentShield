// AgentShield: a real Jenkins pipeline whose every side-effecting command runs through agentshield-guard.
//
// Each guarded step asks the AgentShield gateway first, redeems the one-time decision token, and only then runs
// the command (argv list, no shell). DENY, an unapproved REVIEW and any gateway or redeem error never run it.
// The guard's default session id is Jenkins' BUILD_TAG (jenkins-<job>-<build>), so one build is one AgentShield
// session, shown as one "Real pipeline run" on the console's CI/CD page.
//
// One-time setup (credential, registry, job): ci/jenkins/README.md. Local development use only.

/**
 * Runs `agentshield-guard run <guardArgs>` and fails the stage with a clear message on a non-zero exit.
 * guardArgs is shell text with single-quoted Groovy literals, so $BUILD_NUMBER etc. are expanded by the shell,
 * never interpolated by Groovy. The API key stays in the environment (masked by Jenkins) and is never echoed;
 * the guard never prints it or the decision token.
 */
def guarded(String guardArgs) {
  int code = sh(
    returnStatus: true,
    label: "agentshield-guard: ${env.STAGE_NAME}",
    script: 'set +x\n"$WORKSPACE/.venv/bin/agentshield-guard" run ' + guardArgs
  )
  if (code == 0) {
    return
  }
  // The guard exits 3/4/5 only when it did not run the command; otherwise this is the command's own exit code.
  if (code == 3) {
    error("Blocked by AgentShield (denied or rejected): ${env.STAGE_NAME}")
  }
  if (code == 4 || code == 5) {
    error("AgentShield could not authorize (fail closed): ${env.STAGE_NAME}")
  }
  if (code == 127) {
    error("${env.STAGE_NAME}: the command could not be started (exit 127). Check PATH in the Jenkinsfile.")
  }
  error("${env.STAGE_NAME}: authorized by AgentShield, but the command failed (exit ${code}).")
}

pipeline {
  agent any

  options {
    disableConcurrentBuilds()          // one staging container, one review at a time
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    booleanParam(name: 'ATTACK', defaultValue: false,
      description: 'Add a stage that tries to read $WORKSPACE/.env. AgentShield denies it by policy and the build fails.')
    string(name: 'REVIEW_TIMEOUT', defaultValue: '600', trim: true,
      description: 'Seconds the Push stage waits for an operator to approve it in the AgentShield console.')
  }

  environment {
    AGENTSHIELD_GATEWAY_URL   = 'http://localhost:8081'
    AGENTSHIELD_AGENT_ID      = 'jenkins-ci-agent'
    AGENTSHIELD_AGENT_API_KEY = credentials('agentshield-ci-agent-key')
    // Homebrew (Apple silicon, Intel) and Docker Desktop's CLI and credential helpers on macOS.
    PATH = "/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:${env.PATH}"
    REGISTRY = 'localhost:5001'
  }

  stages {
    stage('Setup') {
      steps {
        script {
          if (!(params.REVIEW_TIMEOUT ==~ /\d{1,5}/)) {
            error("REVIEW_TIMEOUT must be a whole number of seconds, got '${params.REVIEW_TIMEOUT}'.")
          }
        }
        sh '''
          set +x
          set -eu
          command -v docker >/dev/null || { echo "docker not found on PATH ($PATH)."; exit 1; }
          docker info >/dev/null 2>&1 || { echo "Docker is not reachable. Start Docker Desktop (see ci/jenkins/README.md)."; exit 1; }
          curl -fsS -o /dev/null "$AGENTSHIELD_GATEWAY_URL/actuator/health" \
            || { echo "AgentShield backend not reachable at $AGENTSHIELD_GATEWAY_URL."; exit 1; }
          curl -fsS -o /dev/null "http://$REGISTRY/v2/" \
            || { echo "Local registry not reachable on $REGISTRY. Run ci/jenkins/setup-local-infra.sh."; exit 1; }

          # The SDK and the guard from this checkout (local paths only), in a workspace venv.
          python3 -m venv "$WORKSPACE/.venv"
          "$WORKSPACE/.venv/bin/python" -m pip install --quiet --disable-pip-version-check -e sdk/python -e guard
          "$WORKSPACE/.venv/bin/agentshield-guard" --help >/dev/null
          echo "agentshield-guard ready. Session: $BUILD_TAG"
        '''
      }
    }

    stage('Build and test') {
      steps {
        // The Dockerfile "test" stage runs pytest: a failing test fails this build.
        guarded('--tool docker --action WRITE --resource "image:agentshield-risk-engine:$BUILD_NUMBER" ' +
                '-- docker build --target test -t "agentshield-risk-engine-test:$BUILD_NUMBER" risk-engine')
        guarded('--tool docker --action WRITE --resource "image:$REGISTRY/agentshield-risk-engine:$BUILD_NUMBER" ' +
                '-- docker build -t "$REGISTRY/agentshield-risk-engine:$BUILD_NUMBER" risk-engine')
      }
    }

    stage('Attack: read secrets') {
      when { expression { return params.ATTACK } }
      steps {
        // A compromised step tries to read a secret file. PolicyEngine denies any *.env resource, so the guard
        // exits 3 without running cat, and the build stops before anything is pushed.
        guarded('--tool filesystem --action READ --resource "$WORKSPACE/.env" -- cat "$WORKSPACE/.env"')
      }
    }

    stage('Push') {
      steps {
        // EXTERNAL_REQUEST always goes to REVIEW: the build waits here until an operator approves it in the
        // AgentShield console (Reviews), then the guard claims the approval, redeems it and pushes.
        guarded('--tool docker --action EXTERNAL_REQUEST ' +
                '--resource "registry:$REGISTRY/agentshield-risk-engine:$BUILD_NUMBER" ' +
                '--wait-for-review --review-timeout "$REVIEW_TIMEOUT" ' +
                '-- docker push "$REGISTRY/agentshield-risk-engine:$BUILD_NUMBER"')
      }
    }

    stage('Deploy staging') {
      steps {
        // The guard runs argv without a shell, so the container replacement logic lives in the script.
        guarded('--tool docker --action WRITE --resource deploy/staging/risk-engine ' +
                '-- ci/jenkins/deploy-staging.sh "$REGISTRY/agentshield-risk-engine:$BUILD_NUMBER"')
      }
    }

    stage('Smoke test') {
      steps {
        guarded('--tool http --action READ --resource http://localhost:8100/health ' +
                '-- curl -fsS --retry 10 --retry-all-errors --retry-delay 1 http://localhost:8100/health')
      }
    }
  }

  post {
    always {
      // The test image is only a build check; the final image stays for the registry and staging.
      sh 'set +x; docker image rm "agentshield-risk-engine-test:$BUILD_NUMBER" >/dev/null 2>&1 || true'
    }
    success {
      echo 'Every guarded stage was authorized by AgentShield and completed. Staging: http://localhost:8100/health'
    }
  }
}
