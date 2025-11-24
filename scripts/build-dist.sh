#!/usr/bin/env bash
set -e

SOURCE_SHA="${1:-$(git rev-parse HEAD)}"

echo "Building dist from source commit: $SOURCE_SHA"

# Checkout or create dist branch
if git fetch origin dist:dist 2>/dev/null; then
  git checkout dist
else
  git checkout --orphan dist
fi

# Configure git
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# Save existing package.json from dist branch (if it exists)
if [ -f package.json ]; then
  cp package.json package.json.dist
fi

# Remove everything except dist/
git rm -rf . 2>/dev/null || true
git clean -fdx -e dist -e node_modules -e package.json.dist

# Move dist contents to root
mv dist/* . 2>/dev/null || true
rmdir dist 2>/dev/null || true

# Restore dist branch's package.json (or add metadata from source if first build)
if [ -f package.json.dist ]; then
  mv package.json.dist package.json
else
  # First build: checkout from source and fix paths
  git checkout "$SOURCE_SHA" -- package.json README.md LICENSE 2>/dev/null || true
fi

# Stage all changes
git add -A

# Create commit
if git rev-parse --verify HEAD~0 >/dev/null 2>&1; then
  # dist branch exists, create merge commit
  git commit -m "Build dist from $SOURCE_SHA" || true
  git merge --no-ff -m "Merge built dist from main@$SOURCE_SHA" "$SOURCE_SHA" -s ours || true
else
  # First dist commit
  git commit -m "Initial dist build from $SOURCE_SHA"
fi

echo "Dist branch built successfully"
