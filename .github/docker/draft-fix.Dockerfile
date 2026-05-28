# Image for the Draft-Fix workflow on eero-ui.
#
# Mixed-stack repo: frontend (TypeScript/Svelte, npm) + backend (Python).
# Pre-bakes the heavy tooling (Claude Code CLI, gh CLI, Node, Python) AND
# both stacks' dependencies so the workflow runs faster and the agent has
# more turn budget for actual code work.
#
# Built and pushed to ghcr.io by .github/workflows/build-draft-fix-image.yml
# on changes to this Dockerfile, on changes to frontend/package*.json,
# backend/pyproject.toml, weekly, and on workflow_dispatch.
#
# Consumed by .github/workflows/draft-fix.yml via the `container:` key.

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Base OS tooling: git, jq, curl, python, build essentials for native deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git jq \
      python3 python3-pip python3-venv python3-dev \
      build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI — needed by draft-fix.yml's gh issue/pr/comment steps.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
      gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI — the agent runtime that draft-fix.yml invokes.
RUN npm install -g --no-audit --no-fund @anthropic-ai/claude-code \
    && claude --version

# Pre-install frontend npm dependencies into /opt/frontend/node_modules.
# At workflow runtime, draft-fix.yml symlinks this into
# /github/workspace/frontend/node_modules IF the workspace's
# package-lock.json matches what's baked in this image. If it doesn't
# match (a dep was added/bumped after image build), the workflow falls
# back to `npm ci` in the workspace (slower but correct).
WORKDIR /opt/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund --prefer-offline \
    || npm install --no-audit --no-fund

# Pre-install backend Python deps into the system site-packages.
WORKDIR /tmp/preinstall-backend
COPY backend/pyproject.toml ./
RUN python3 -m pip install --break-system-packages --upgrade pip \
    && (python3 -m pip install --break-system-packages '.[dev]' \
        || python3 -m pip install --break-system-packages '.' \
        || true) \
    && rm -rf /root/.cache/pip

# actions/checkout writes to /github/workspace by default in container jobs.
WORKDIR /github/workspace
