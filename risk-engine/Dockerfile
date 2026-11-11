# ============================================================
# AgentShield Risk Engine — Dockerfile (multi-stage)
#
#   docker build --target test -t agentshield-risk-engine-test .   runs the test suite; fails the build on a failure
#   docker build -t agentshield-risk-engine .                       final image (default target: runtime)
#
# The final stage holds only the runtime dependencies and the two service modules, and runs as a non-root user.
# ============================================================

# ---- base: runtime dependencies only ----
FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- test: base + test tools + the whole source; a failing test fails this stage ----
FROM base AS test
COPY requirements-test.txt .
RUN pip install -r requirements-test.txt
COPY . .
RUN python -m pytest -q -p no:cacheprovider

# ---- runtime: slim, non-root, service code only ----
FROM base AS runtime
RUN groupadd --system --gid 10001 riskengine \
 && useradd --system --uid 10001 --gid riskengine --no-create-home --shell /usr/sbin/nologin riskengine
COPY --chown=root:root main.py scoring.py ./
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
