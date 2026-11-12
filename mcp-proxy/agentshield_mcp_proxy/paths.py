"""
Resource path canonicalization. Every path argument is resolved before the gateway sees it:

- relative paths are resolved against the allowed root (not the process working directory),
- "~" is expanded, as the filesystem server does,
- ".." is collapsed and symlinks are resolved (os.path.realpath; for a path that does not exist yet, the
  existing part is resolved and the rest is kept),
- the result must be the root or lie under it, otherwise the call is rejected before any gateway or downstream call.

The gateway sees the root-relative path ("docs/../.env" -> ".env"); the downstream server receives the canonical
absolute path, so what was evaluated is exactly what runs.

Limit: a symlink created between this check and the downstream call is not seen (time-of-check to time-of-use).
"""

from __future__ import annotations

import os
from dataclasses import dataclass


class PathRejected(Exception):
    """The path is invalid or outside the allowed root. The message is safe to show to the model."""


@dataclass(frozen=True)
class CanonicalPath:
    relative: str   # root-relative, "/"-separated; "." for the root itself
    absolute: str   # canonical absolute path handed to the downstream server


def canonicalize(root: str, value: object) -> CanonicalPath:
    if not isinstance(value, str) or value.strip() == "":
        raise PathRejected("a path argument is missing or is not a string")
    if "\x00" in value:
        raise PathRejected("a path argument contains a NUL character")
    expanded = os.path.expanduser(value)
    candidate = expanded if os.path.isabs(expanded) else os.path.join(root, expanded)
    real = os.path.realpath(candidate)
    if real != root and not real.startswith(root.rstrip(os.sep) + os.sep):
        raise PathRejected("the path is outside the allowed directory")
    relative = os.path.relpath(real, root)
    return CanonicalPath(relative=relative.replace(os.sep, "/"), absolute=real)
