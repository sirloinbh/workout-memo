#!/bin/bash
# Runs on the Lightsail server from /opt/workout-memo (#73), started by scripts/deploy.ps1.
#   deploy <ref>  build the commit, back up, migrate, start, health check; on failure
#                 start the previous images again
#   rollback      start the previously deployed images again
# Images are tagged by commit, so a rollback does not rebuild. Migrations are
# forward-only; restoring data from the pre-deploy dump is a separate, manual step.
set -euo pipefail
cd /opt/workout-memo

health() {
  for _ in $(seq 1 30); do
    # Connection resets while containers start are expected; only the final result matters.
    if curl -fsS http://127.0.0.1/api/health > /dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
start() {
  # Check out the commit that matches the images so compose.yaml and migrations agree.
  git checkout --quiet --detach "$1"
  IMAGE_TAG="$1" docker compose up -d --wait db
  IMAGE_TAG="$1" docker compose up -d
}

current=$(cat .deployed 2>/dev/null || true)
case "${1:-}" in
  deploy)
    ref=${2:?usage: remote-deploy.sh deploy <git ref>}
    git fetch --quiet --tags origin
    git checkout --quiet --detach "$ref"
    tag=$(git rev-parse --short=12 HEAD)
    echo "deploy $tag (previous: ${current:-none})"
    IMAGE_TAG="$tag" docker compose build
    if [ -n "$current" ]; then /usr/local/bin/workout-backup; fi
    IMAGE_TAG="$tag" docker compose up -d --wait db
    IMAGE_TAG="$tag" docker compose run --rm --no-deps \
      -v "$PWD/database/migrations:/database/migrations:ro" api node dist/migrate.js
    IMAGE_TAG="$tag" docker compose up -d
    if ! health; then
      echo "health check failed for $tag" >&2
      if [ -n "$current" ]; then
        start "$current"
        health && echo "restored $current" >&2
      fi
      exit 1
    fi
    if [ -n "$current" ] && [ "$current" != "$tag" ]; then echo "$current" > .previous; fi
    echo "$tag" > .deployed
    # Keep only the current and previous images. grep exits 1 when nothing is left to
    # remove, which must not fail an otherwise successful deploy under pipefail.
    keep="$tag|$(cat .previous 2>/dev/null || echo none)"
    for image in workout-backend workout-frontend; do
      docker image ls "$image" --format '{{.Tag}}' | { grep -vxE "$keep" || true; } |
        xargs -r -I{} docker image rm "$image:{}" > /dev/null
    done
    echo "deployed $tag"
    ;;
  rollback)
    previous=$(cat .previous 2>/dev/null || true)
    if [ -z "$previous" ]; then echo "no previous deployment" >&2; exit 1; fi
    start "$previous"
    health
    echo "$current" > .previous
    echo "$previous" > .deployed
    echo "rolled back to $previous"
    ;;
  *)
    echo "usage: remote-deploy.sh deploy <git ref> | rollback" >&2
    exit 2
    ;;
esac
