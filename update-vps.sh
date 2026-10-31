#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING CRM — 1-COMMAND VPS UPDATE & REBUILD SCRIPT
# Usage on VPS (run inside /home/stzk/admafia):
#   chmod +x update-vps.sh
#   ./update-vps.sh
# =============================================================================
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================================================"
echo "🔄 Updating AdMafia Marketing CRM on VPS: $APP_DIR"
echo "======================================================================"

cd "$APP_DIR"

# 1. Pull latest commits from GitHub
echo "📥 1/4 Pulling latest changes from GitHub (main)..."
git pull origin main

# 2. Build Frontend Production Distribution (Removes old cache and rebuilds dist)
echo "🔨 2/4 Building frontend production assets..."
cd "$APP_DIR/frontend"
npm install
npm run build

# 3. Check Backend Dependencies
echo "📦 3/4 Verifying backend dependencies..."
cd "$APP_DIR/backend"
npm install

# 4. Restart PM2 Daemon
echo "🚀 4/4 Restarting PM2 application..."
pm2 restart all || pm2 restart admafia

echo "======================================================================"
echo "✅ Update complete! Fresh build is now active on https://admafia.marketing"
echo "💡 Tip: Hard-refresh your browser (Ctrl + Shift + R or Cmd + Shift + R) to view changes."
echo "======================================================================"
