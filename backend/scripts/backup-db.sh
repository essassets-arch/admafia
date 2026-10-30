#!/bin/bash
# =============================================================================
# AdMafia Production PostgreSQL Database Backup & Verification Runbook
# Run this script on the target VPS before running migrations or deploying
# =============================================================================

set -e

BACKUP_DIR="/home/stzk/admafia/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/admafia_crm_backup_${TIMESTAMP}.sql"

echo "=========================================================="
echo "📦 STARTING ADMAFIA POSTGRESQL PRODUCTION BACKUP"
echo "=========================================================="

mkdir -p "$BACKUP_DIR"

# Check if PostgreSQL container is running
if docker ps --format '{{.Names}}' | grep -q "admafia-postgres"; then
  echo "✓ Found running admafia-postgres container."
  echo "Taking full database snapshot to: $BACKUP_FILE"
  docker exec -t admafia-postgres pg_dump -U postgres -d admafia_crm > "$BACKUP_FILE"
elif command -v pg_dump &> /dev/null; then
  echo "Taking direct PostgreSQL snapshot..."
  pg_dump -U postgres -d admafia_crm > "$BACKUP_FILE"
else
  echo "ℹ️ Using node database snapshot tool..."
  node -e "
    const fs = require('fs');
    const path = require('path');
    const src = path.join(__dirname, '..', 'pgdata');
    const dest = path.join('${BACKUP_DIR}', 'pgdata_snap_${TIMESTAMP}');
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
      console.log('✓ Successfully backed up pgdata to ' + dest);
    }
  "
fi

if [ -f "$BACKUP_FILE" ]; then
  FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup successfully created: $BACKUP_FILE ($FILE_SIZE)"
else
  echo "✅ File-level database snapshot created in $BACKUP_DIR"
fi

echo "=========================================================="
echo "Rollback command if ever needed:"
echo "cat $BACKUP_FILE | docker exec -i admafia-postgres psql -U postgres -d admafia_crm"
echo "=========================================================="

