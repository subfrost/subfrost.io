#!/usr/bin/env bash
# ===========================================================================
# run-drive-migration.sh — turnkey one-shot to migrate the SUBFROST + OYL gdrive
# dumps into the live /admin Documents drive. Run from the whitebot box (where
# the dump files live).
#
# It (1) applies the additive schema to prod, (2) seeds ~102 registry entities,
# (3) ingests the curated SUBFROST docs, (4) ingests the curated OYL docs.
# GCS auth comes from ~/.ioenv (the io-owner service-account key). You supply the
# prod database URL.
#
# USAGE
#   DATABASE_URL='postgresql://USER:PASS@HOST:5432/DB' bash scripts/run-drive-migration.sh
#
#   # preview only (no DB writes, no uploads):
#   bash scripts/run-drive-migration.sh --report
#
# Safe to re-run: schema push is additive; seed and ingest are idempotent
# (entities deduped by name+scope, files deduped by folder+name).
# ===========================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

REPORT=""
if [[ "${1:-}" == "--report" ]]; then REPORT="--report"; fi

if [[ -z "$REPORT" ]]; then
  : "${DATABASE_URL:?Set DATABASE_URL to the prod Postgres connection string (see external-secrets / Cloud SQL) before running}"

  # --- GCS auth from ~/.ioenv (io-owner SA) for the Node @google-cloud/storage lib
  if [[ -f "$HOME/.ioenv" ]]; then
    # shellcheck disable=SC1091
    set -a; source "$HOME/.ioenv" >/dev/null 2>&1 || true; set +a
  fi
  if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -n "${SERVICE_ACCOUNT_KEY:-}" ]]; then
    KEYFILE="$(mktemp)"; trap 'rm -f "$KEYFILE"' EXIT
    # SERVICE_ACCOUNT_KEY may be raw JSON or base64-encoded JSON
    if printf '%s' "$SERVICE_ACCOUNT_KEY" | head -c1 | grep -q '{'; then
      printf '%s' "$SERVICE_ACCOUNT_KEY" > "$KEYFILE"
    else
      printf '%s' "$SERVICE_ACCOUNT_KEY" | base64 -d > "$KEYFILE" 2>/dev/null || printf '%s' "$SERVICE_ACCOUNT_KEY" > "$KEYFILE"
    fi
    export GOOGLE_APPLICATION_CREDENTIALS="$KEYFILE"
  fi
  # docs bucket is subfrost-docs (NOT the .ioenv GCS_BUCKET, which is for streams)
  export DOCS_BUCKET="${DOCS_BUCKET:-subfrost-docs}"

  if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
    echo "WARN: no GCS credentials resolved (GOOGLE_APPLICATION_CREDENTIALS unset and no SERVICE_ACCOUNT_KEY in ~/.ioenv)." >&2
    echo "      The ingest will fail on upload. Set GOOGLE_APPLICATION_CREDENTIALS to a key with write access to gs://$DOCS_BUCKET." >&2
  fi

  echo "==> [1/4] applying additive schema to prod (prisma db push)"
  npx prisma db push --skip-generate

  echo "==> [2/4] seeding legal registry (~102 entities)"
  node scripts/seed-legal-entities.mjs

  echo "==> [3/4] ingesting SUBFROST drive"
  node scripts/ingest-drive.mjs --source subfrost

  echo "==> [4/4] ingesting OYL drive"
  node scripts/ingest-drive.mjs --source oyl

  echo "==> done. Verify in /admin/files and /admin/oyl, and on a Legal entity's Documents tab."
else
  echo "==> PREVIEW (no writes)"
  node scripts/seed-legal-entities.mjs --report
  echo
  node scripts/ingest-drive.mjs --source subfrost --report
  echo
  node scripts/ingest-drive.mjs --source oyl --report
fi
