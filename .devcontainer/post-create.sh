#!/usr/bin/env bash
# Runs once inside the container after it is created.
set -euo pipefail

# Git identity comes from the host's config, mounted read-only. Only the
# identity is copied: the host's credential helpers point at host paths.
if [ -f "$HOME/.host-gitconfig" ]; then
  for key in user.name user.email; do
    value=$(git config -f "$HOME/.host-gitconfig" "$key" || true)
    if [ -n "$value" ]; then git config --global "$key" "$value"; fi
  done
fi
git config --global --add safe.directory "$PWD"

# GitHub auth for pushes. GH_TOKEN is passed through from the host at
# `devcontainer up`; without it this only wires git to ask gh later.
gh auth setup-git >/dev/null 2>&1 || true

python3 -m pip install --user --quiet pillow

bun install
if [ -d node_modules/playwright ]; then
  bunx playwright install chromium
fi
