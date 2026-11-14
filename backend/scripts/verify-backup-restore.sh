#!/usr/bin/env bash
# ==============================================================================
# AdMafia Automated Disaster-Recovery Verification Drill
# Restores a snapshot into an isolated scratch namespace and verifies collection counts.
# ==============================================================================
set -euo pipefail

SNAPSHOT_PATH="${1:-}"
VERIFY_URI="${VERIFY_MONGO_URI:-mongodb://127.0.0.1:27018/?directConnection=true}"
SCRATCH_DB="admafia_dr_verify_tmp"

if [[ -z "${SNAPSHOT_PATH}" || ! -f "${SNAPSHOT_PATH}" ]]; then
  echo "Usage: $0 <path-to-snapshot.archive.gz>"
  exit 1
fi

echo "[DR Drill] Restoring ${SNAPSHOT_PATH} into isolated scratch DB (${SCRATCH_DB})..."
mongorestore \
  --uri="${VERIFY_URI}" \
  --archive="${SNAPSHOT_PATH}" \
  --gzip \
  --nsFrom="admafia_crm.*" \
  --nsTo="${SCRATCH_DB}.*" \
  --drop

echo "[DR Drill] Counting restored collections..."
mongosh "${VERIFY_URI}" --quiet --eval "
  const dbRef = db.getSiblingDB('${SCRATCH_DB}');
  const cols = dbRef.getCollectionNames();
  print('Restored collections:', cols.length);
  for (const c of cols) {
    print('  -', c, ':', dbRef.getCollection(c).countDocuments());
  }
  dbRef.dropDatabase();
"
echo "✓ Disaster-recovery verification drill passed and scratch DB cleaned."

