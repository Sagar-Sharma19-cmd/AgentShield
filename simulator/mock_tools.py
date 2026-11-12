"""
Harmless mock DevOps tools.

These functions never contact a network service, never run a shell command, never touch a
Docker daemon or a Kubernetes cluster, and never read a real repository or credential. Each
one only appends a line to execution.log inside a temporary run directory, and returns a
description of what a real tool would have been asked to do.
"""

from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from typing import Callable, Dict

from enforcement import Operation

LOG_FILE_NAME = "execution.log"


class MockDevOps:
    def __init__(self, run_dir: str):
        self.run_dir = run_dir
        self.log_path = os.path.join(run_dir, LOG_FILE_NAME)

    @classmethod
    def in_temporary_directory(cls) -> "MockDevOps":
        return cls(tempfile.mkdtemp(prefix="agentshield-sim-"))

    def _record(self, operation: Operation, detail: str) -> str:
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        line = f"{stamp} {operation.tool} {operation.action} {operation.resource} :: {detail}"
        with open(self.log_path, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
        return detail

    # GitHub: read repository and build information (simulated).
    def github_read_build_info(self, operation: Operation) -> str:
        return self._record(operation, "MOCK read of repository build metadata (no network call)")

    # Jenkins: trigger a simulated build.
    def jenkins_trigger_build(self, operation: Operation) -> str:
        return self._record(operation, "MOCK trigger of build job (no Jenkins contact)")

    # Docker: build and push a simulated image.
    def docker_build_image(self, operation: Operation) -> str:
        return self._record(operation, "MOCK image build (no Docker daemon contact)")

    def docker_push_image(self, operation: Operation) -> str:
        return self._record(operation, "MOCK image push (no registry contact)")

    # Kubernetes: apply and delete simulated resources.
    def kubernetes_apply(self, operation: Operation) -> str:
        return self._record(operation, "MOCK apply of manifest (no cluster contact)")

    def kubernetes_delete(self, operation: Operation) -> str:
        return self._record(operation, "MOCK delete of resource (no cluster contact)")

    # Shell: a harmless simulated command.
    def shell_healthcheck(self, operation: Operation) -> str:
        return self._record(operation, "MOCK healthcheck (no process is started)")

    # Filesystem: read a file (simulated; nothing is opened).
    def filesystem_read(self, operation: Operation) -> str:
        return self._record(operation, "MOCK file read (no filesystem access)")

    # curl: an outbound HTTP request (simulated; nothing is sent).
    def curl_post_data(self, operation: Operation) -> str:
        return self._record(operation, "MOCK HTTP POST (no network call)")

    # Filesystem: write an export file (simulated; nothing is written).
    def filesystem_write_export(self, operation: Operation) -> str:
        return self._record(operation, "MOCK export write (no filesystem access)")

    def executors(self) -> Dict[str, Callable[[Operation], str]]:
        """Maps Operation.name to the mock implementation. Used by enforcement.run_pipeline."""
        return {
            "github.read_build_info": self.github_read_build_info,
            "jenkins.trigger_build": self.jenkins_trigger_build,
            "docker.build_image": self.docker_build_image,
            "docker.push_image": self.docker_push_image,
            "kubernetes.apply": self.kubernetes_apply,
            "kubernetes.delete": self.kubernetes_delete,
            "shell.healthcheck": self.shell_healthcheck,
            "filesystem.read_file": self.filesystem_read,
            "curl.post_data": self.curl_post_data,
            "filesystem.write_export": self.filesystem_write_export,
        }
