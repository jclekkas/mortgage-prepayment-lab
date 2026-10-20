#!/usr/bin/env bash
# Build the public synthetic-data review preview for GitHub Pages from the current,
# clean commit, into an output directory ready to become the gh-pages branch.
# Usage: scripts/build-preview.sh <output-dir>
set -euo pipefail
out="${1:?usage: scripts/build-preview.sh <output-dir>}"
if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to build a preview from a dirty working tree: commit first." >&2
  exit 1
fi
commit="$(git rev-parse HEAD)"
repo="${PREVIEW_REPO_NAME:-mortgage-prepayment-lab}"
rm -rf dist
BASE_PATH="/${repo}/" BUILD_COMMIT="$commit" npm run build
mkdir -p "$out/.github/workflows"
cp -R dist/. "$out/"
touch "$out/.nojekyll"                       # serve files as-is, no Jekyll processing
echo "$commit" > "$out/SOURCE_COMMIT"        # read by the smoke workflow
cp deploy/preview-smoke.yml "$out/.github/workflows/preview-smoke.yml"
echo "Preview for $commit written to $out"
