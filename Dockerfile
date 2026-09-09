# harnesslab — the platform, in a container.
#
#   docker build -t harnesslab .
#   docker run --rm -p 8765:8765 -e OPENROUTER_API_KEY=sk-or-... harnesslab
#   -> http://127.0.0.1:8765
#
# Stage 1 builds the React UI (node is not needed at runtime); stage 2 is a plain python:3.12-slim
# with the wheel installed. The lab root inside the image is /lab, so harnesses/, tasks/ and
# data/runs/ resolve through harnesslab.backend.paths' "checkout" branch with no configuration.

# --------------------------------------------------------------------------- 1. build the UI
FROM node:22-slim AS ui
WORKDIR /ui
COPY harnesslab/frontend/package.json harnesslab/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY harnesslab/frontend/ ./
RUN npm run build

# --------------------------------------------------------------------------- 2. runtime
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HARNESSLAB_LAB=/lab \
    HARNESSLAB_NO_BROWSER=1

WORKDIR /lab

# Package metadata first so a source-only change does not re-resolve dependencies.
COPY pyproject.toml README.md ./
COPY agentlab/ ./agentlab/
COPY harnesslab/ ./harnesslab/
COPY harnesses/ ./harnesses/
COPY tasks/ ./tasks/
COPY exercises/ ./exercises/
COPY trajectory_tests/ ./trajectory_tests/
COPY tests_agentlab/ ./tests_agentlab/
COPY data/ ./data/
COPY --from=ui /ui/dist/ ./harnesslab/frontend/dist/

RUN pip install --no-cache-dir . && python -c "import harnesslab.backend.app"

# The agent sandbox is a scratch copy plus a command policy, not a security boundary: run unprivileged.
RUN useradd --create-home --uid 10001 harnesslab && chown -R harnesslab:harnesslab /lab
USER harnesslab

EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/api/results', timeout=2).status==200 else 1)"

CMD ["harnesslab", "--host", "0.0.0.0", "--port", "8765", "--no-browser"]
