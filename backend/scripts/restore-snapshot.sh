#!/usr/bin/env bash
# ==============================================================================
# AdMafia Fast Point-in-Time MongoDB Snapshot Restore Script (`--oplogReplay`)
# Usage:
#   BACKUP_PASSPHRASE="..." ./backend/scripts/restore-snapshot.sh ./backups/admafia_snapshot_...archive.gz.enc
# ==============================================================================
set -euo pipefail

SNAPSHOT_PATH="${1:-}"
TARGET_MONGO_URI="${TARGET_MONGO_URI:-mongodb://127.0.0.1:27017/?directConnection=true}"

if [[ -z "${SNAPSHOT_PATH}" || ! -f "${SNAPSHOT_PATH}" ]]; then
  echo "Usage: $0 <path-to-snapshot.archive.gz[.enc]>"
  exit 1
fi

if [[ -f "${SNAPSHOT_PATH}.sha256" ]]; then
  echo "[1/3] Verifying SHA-256 checksum..."
  (cd "$(dirname "${SNAPSHOT_PATH}")" && sha256sum -c "$(basename "${SNAPSHOT_PATH}.sha256")")
fi

WORK_ARCHIVE="${SNAPSHOT_PATH}"
CLEANUP_TMP=0

if [[ "${SNAPSHOT_PATH}" == *.enc ]]; then
  if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
    echo "Error: BACKUP_PASSPHRASE environment variable is required to decrypt ${SNAPSHOT_PATH}"
    exit 1
  fi
  WORK_ARCHIVE="${SNAPSHOT_PATH%.enc}.decrypted.tmp"
  CLEANUP_TMP=1
  echo "[2/3] Decrypting AES-256 archive..."
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass env:BACKUP_PASSPHRASE \
    -in "${SNAPSHOT_PATH}" \
    -out "${WORK_ARCHIVE}"
fi

OPLOG_TARGET_URI="$(printf '%s' "${TARGET_MONGO_URI}" | sed -E 's#(mongodb(\+srv)?://[^/?]+)/[^?]*#\1/#')"
echo "[3/3] Restoring point-in-time archive with --oplogReplay into ${OPLOG_TARGET_URI}..."
if command -v mongorestore >/dev/null 2>&1; then
  mongorestore --uri="${OPLOG_TARGET_URI}" --archive="${WORK_ARCHIVE}" --gzip --oplogReplay --drop
else
  CONTAINER_NAME="${MONGO_CONTAINER:-admafia-mongo}"
  cat "${WORK_ARCHIVE}" | docker exec -i "${CONTAINER_NAME}" mongorestore --uri="mongodb://127.0.0.1:27017/?directConnection=true" --archive --gzip --oplogReplay --drop
fi

if [[ "${CLEANUP_TMP}" -eq 1 ]]; then
  rm -f "${WORK_ARCHIVE}"
fi

echo "✓ Database restore completed successfully."

