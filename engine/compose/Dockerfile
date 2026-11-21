# Stage Director runner image: the official GitHub Actions runner plus the tools deploy
# commands need (ssh, rsync, git, jq, python3-yaml, gh, Node + Wrangler, docker CLI).
ARG RUNNER_VERSION=2.338.2
ARG NODE_VERSION=20.18.1

FROM node:${NODE_VERSION}-bookworm-slim AS node

FROM ghcr.io/actions/actions-runner:${RUNNER_VERSION}
ARG WRANGLER_VERSION=3.99.0
# Optional Ubuntu mirror, e.g. http://ubuntu.mirrors.ovh.net/ubuntu/ on OVH hosts, where
# archive/security.ubuntu.com can time out and apt-get update hangs. Empty = Ubuntu defaults.
ARG APT_MIRROR=
# Headless Chromium for the review screenshots (about 350 MB). WITH_BROWSER=false leaves it out;
# the workflow then skips screenshots on this runner.
ARG WITH_BROWSER=true
ARG PLAYWRIGHT_VERSION=1.49.1
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
USER root
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# hadolint ignore=SC2016
RUN if [ -n "$APT_MIRROR" ]; then \
      for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do \
        if [ -f "$f" ]; then sed -i -E "s#https?://(archive|security)\.ubuntu\.com/ubuntu/?#${APT_MIRROR%/}/#g" "$f"; fi; \
      done; \
    fi
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssh-client rsync git jq curl ca-certificates python3 python3-yaml gnupg tini socat \
 && install -d -m 755 /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && . /etc/os-release \
 && echo "deb [signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && npm install -g "wrangler@${WRANGLER_VERSION}" \
 && if [ "$WITH_BROWSER" = true ]; then \
      npm install -g "playwright@${PLAYWRIGHT_VERSION}" \
      && playwright install --with-deps chromium \
      && chmod -R a+rX /opt/ms-playwright \
      && rm -rf /var/lib/apt/lists/*; \
    fi \
 && npm cache clean --force
RUN install -d -o runner -g runner /home/runner/state /home/runner/_work
COPY entrypoint.sh /usr/local/bin/stagedirector-entrypoint
RUN chmod 755 /usr/local/bin/stagedirector-entrypoint
USER runner
WORKDIR /home/runner
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/stagedirector-entrypoint"]
