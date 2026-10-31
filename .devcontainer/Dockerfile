FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

# System libraries for headless Chromium, which Playwright uses for screenshots
# and WebGL smoke tests. The browser itself is installed per project version in
# post-create.sh.
RUN npx -y playwright@1.63.0 install-deps chromium \
    && rm -rf /root/.npm /root/.cache /var/lib/apt/lists/*
