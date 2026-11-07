#!/usr/bin/env bash
# Runs once inside the container after it is created.
set -euo pipefail

# Git identity comes from the host's config, mounted read-only. Only the
# identity is copied: the host's credential helpers point at host paths.
# Run git from / so a worktree .git file pointing to a host path does not
# abort global configuration inside the container.
if [ -f "$HOME/.host-gitconfig" ]; then
  for key in user.name user.email; do
    value=$(git -C / config -f "$HOME/.host-gitconfig" "$key" || true)
    if [ -n "$value" ]; then git -C / config --global "$key" "$value"; fi
  done
fi
git -C / config --global --add safe.directory "$PWD"
if [ -f "$PWD/.git" ]; then
  gitdir=$(sed -n 's/^gitdir: //p' "$PWD/.git")
  if [ -n "$gitdir" ]; then
    git -C / config --global --add safe.directory "$gitdir"
    git -C / config --global --add safe.directory "$(dirname "$(dirname "$gitdir")")"
  fi
fi

# GitHub auth for pushes. GH_TOKEN reaches the container from the host
# environment of each `devcontainer exec` call (set it on the host as
# GH_TOKEN="$(gh auth token)"); without it this only wires git to ask gh.
(cd / && gh auth setup-git --hostname github.com --force) >/dev/null 2>&1 || true

python3 -m pip install --user --quiet pillow

bun install
if [ -d node_modules/@playwright/test ]; then
  bunx playwright install chromium
fi
