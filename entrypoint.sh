#!/usr/bin/env bash
# Entrypoint for the "collect & build DWH" Docker container action.
#
# Args (positional, from action.yml): <config> <dwh-dir> <from>
#   config   path to config.toml, relative to the consumer repo root
#   dwh-dir  directory for the committed DWH parquet files
#   from     optional YYYY-MM-DD; when set, backfills history down to that date
#
# Auth: the engine reads GITHUB_TOKEN (or the GITHUB_APP_* trio) from the
# environment. Docker container actions do NOT receive GITHUB_TOKEN
# automatically, so the consumer step must pass it via `env:` (see README).
# GITHUB_API_URL / GITHUB_GRAPHQL_URL (GitHub Enterprise Server) are injected
# automatically by the runner.
#
# `set -e` is intentionally omitted around the build so ownership is always
# restored, even when collection fails partway (e.g. a rate limit).
set -uo pipefail

config="${1:-config.toml}"
dwh_dir="${2:-data/dwh}"
from="${3:-}"

ws="${GITHUB_WORKSPACE:-$PWD}"
cd "$ws" || { echo "entrypoint: cannot cd into workspace '$ws'" >&2; exit 1; }

args=(--config "$ws/$config" --dwh-dir "$ws/$dwh_dir")
if [[ -n "$from" ]]; then
  args+=(--from "$from")
fi

node /engine/dist/src/cli/dwh-build.js "${args[@]}"
code=$?

# Docker actions run as root, so files written into the mounted workspace are
# root-owned. Hand them back to the host user, or the next actions/checkout and
# the consumer's `git commit` would fail with permission errors.
owner="$(stat -c '%u:%g' "$ws" 2>/dev/null || true)"
if [[ -n "$owner" ]]; then
  chown -R "$owner" "$ws/$dwh_dir" 2>/dev/null || true
  chown "$owner" "$(dirname "$ws/$dwh_dir")" 2>/dev/null || true
fi

exit "$code"
