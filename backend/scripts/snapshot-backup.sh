#!/usr/bin/env bash
# ==============================================================================
# AdMafia 3-2-1 Point-in-Time Encrypted MongoDB Snapshot Engine (`--oplog`)
# Supports Local Docker (`admafia-mongo-local`), VPS Docker (`admafia-mongo`),
# or MongoDB Atlas Dedicated (`MONGO_URI`), with AES-256 encryption & R2 sync.
# ==============================================================================
set -euo pipefail

TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/?directConnection=true}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "${BACKUP_DIR}"
RAW_ARCHIVE="${BACKUP_DIR}/admafia_snapshot_${TIMESTAMP}.archive.gz"

# Note: `mongodump --oplog` requires a cluster-level URI without a database path (e.g. `mongodb://host:27017/?...`)
OPLOG_MONGO_URI="$(printf '%s' "${MONGO_URI}" | sed -E 's#(mongodb(\+srv)?://[^/?]+)/[^?]*#\1/#')"

echo "[1/4] Capturing atomic point-in-time --oplog snapshot -> ${RAW_ARCHIVE}..."
if command -v mongodump >/dev/null 2>&1; then
  mongodump --uri="${OPLOG_MONGO_URI}" --oplog --archive="${RAW_ARCHIVE}" --gzip
else
  CONTAINER_NAME="${MONGO_CONTAINER:-admafia-mongo}"
  docker exec "${CONTAINER_NAME}" mongodump --uri="mongodb://127.0.0.1:27017/?directConnection=true" --oplog --archive --gzip > "${RAW_ARCHIVE}"
fi

FINAL_FILE="${RAW_ARCHIVE}"
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "[2/4] Encrypting archive with OpenSSL AES-256-CBC (PBKDF2 100k iterations)..."
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -pass env:BACKUP_PASSPHRASE \
    -in "${RAW_ARCHIVE}" \
    -out "${RAW_ARCHIVE}.enc"
  rm -f "${RAW_ARCHIVE}"
  FINAL_FILE="${RAW_ARCHIVE}.enc"
else
  echo "[2/4] BACKUP_PASSPHRASE not set; keeping compressed archive unencrypted."
fi

echo "[3/4] Writing SHA-256 integrity manifest..."
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${FINAL_FILE}" > "${FINAL_FILE}.sha256"
else
  shasum -a 256 "${FINAL_FILE}" > "${FINAL_FILE}.sha256"
fi

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  echo "[4/4] Syncing encrypted snapshot offsite to ${RCLONE_REMOTE}..."
  rclone copy "${FINAL_FILE}" "${RCLONE_REMOTE}"
  rclone copy "${FINAL_FILE}.sha256" "${RCLONE_REMOTE}"
else
  echo "[4/4] RCLONE_REMOTE not configured; skipping offsite Cloudflare R2 / S3 upload."
fi

# Prune local snapshots older than RETENTION_DAYS
find "${BACKUP_DIR}" -maxdepth 1 -type f -name "admafia_snapshot_*" -mtime +"${RETENTION_DAYS}" -delete || true

echo "✓ Snapshot complete: ${FINAL_FILE}"

