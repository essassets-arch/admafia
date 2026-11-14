#!/bin/bash
# =============================================================================
# AdMafia Production MongoDB Database Backup & Restore Runbook
# Run this script on the target VPS before maintenance or deployments
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../../backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_FILE="${BACKUP_DIR}/admafia_crm_mongo_${TIMESTAMP}.archive.gz"

echo "=========================================================="
echo "📦 STARTING ADMAFIA MONGODB PRODUCTION BACKUP"
echo "=========================================================="

mkdir -p "$BACKUP_DIR"

if docker ps --format '{{.Names}}' | grep -q "^admafia-mongo$"; then
  echo "✓ Found running admafia-mongo container."
  echo "Taking full compressed mongodump archive to: $ARCHIVE_FILE"
  docker exec admafia-mongo mongodump --db=admafia_crm --archive --gzip > "$ARCHIVE_FILE"
elif command -v mongodump &> /dev/null; then
  echo "Taking direct host mongodump archive..."
  mongodump --uri="${MONGO_URI:-mongodb://127.0.0.1:27017/admafia_crm?directConnection=true}" --archive="$ARCHIVE_FILE" --gzip
else
  echo "❌ Error: Neither running admafia-mongo container nor host mongodump CLI found."
  exit 1
fi

FILE_SIZE=$(du -h "$ARCHIVE_FILE" | cut -f1)
echo "✅ MongoDB backup successfully created: $ARCHIVE_FILE ($FILE_SIZE)"
echo "=========================================================="
echo "Restore command if ever needed:"
echo "cat $ARCHIVE_FILE | docker exec -i admafia-mongo mongorestore --archive --gzip --drop"
echo "=========================================================="
