#!/usr/bin/env bash
set -euo pipefail

if ! command -v doctl >/dev/null 2>&1; then
  echo "doctl not installed. Install via: https://docs.digitalocean.com/reference/doctl/"
  exit 0
fi

if [ -z "${DO_DB_CLUSTER_ID:-}" ]; then
  echo "Set DO_DB_CLUSTER_ID to your managed Postgres cluster ID."
  exit 0
fi

doctl databases backups list "$DO_DB_CLUSTER_ID"
