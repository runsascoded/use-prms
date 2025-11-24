#!/usr/bin/env bash
set -e

SOURCE_SHA="${1:-$(git rev-parse HEAD)}"
DIST_BRANCH="${DIST_BRANCH:-dist}"

echo "Building $DIST_BRANCH from source commit: $SOURCE_SHA"

# Checkout or create dist branch
if git fetch origin "$DIST_BRANCH:$DIST_BRANCH" 2>/dev/null; then
  git checkout "$DIST_BRANCH"
else
  git checkout --orphan "$DIST_BRANCH"
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

# Restore dist branch's package.json
if [ -f package.json.dist ]; then
  mv package.json.dist package.json
else
  echo "ERROR: No package.json found on $DIST_BRANCH branch"
  echo "This script requires an existing $DIST_BRANCH branch with a package.json"
  echo "For initial $DIST_BRANCH branch setup, manually create package.json with correct paths:"
  echo "  main: ./index.cjs (not ./dist/index.cjs)"
  echo "  module: ./index.js (not ./dist/index.js)"
  exit 1
fi

# Stage all changes
git add -A

# Create commit
if git rev-parse --verify HEAD~0 >/dev/null 2>&1; then
  # dist branch exists, create merge commit
  git commit -m "Build $DIST_BRANCH from $SOURCE_SHA" || true
  git merge --no-ff -m "Merge built $DIST_BRANCH from main@$SOURCE_SHA" "$SOURCE_SHA" -s ours || true
else
  # First dist commit
  git commit -m "Initial $DIST_BRANCH build from $SOURCE_SHA"
fi

echo "$DIST_BRANCH branch built successfully"
