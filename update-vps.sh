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

# 1. Pull latest commits from GitHub (Clean discard of local build artifacts)
echo "📥 1/4 Pulling latest changes from GitHub (main)..."
git fetch origin main
git reset --hard origin/main

# 2. Build Frontend Production Distribution (Removes old cache and rebuilds dist)
echo "🔨 2/4 Building frontend production assets..."
cd "$APP_DIR/frontend"
npm install
npm run build

# 3. Check Backend Dependencies
echo "📦 3/4 Verifying backend dependencies..."
cd "$APP_DIR/backend"
npm install

# 4. Restart Application Daemon (Docker Compose or PM2)
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
  echo "🚀 4/4 Rebuilding and restarting Docker Compose containers..."
  cd "$APP_DIR"
  docker compose up -d --build
else
  echo "🚀 4/4 Restarting PM2 application..."
  pm2 restart all || pm2 restart admafia 2>/dev/null || true
fi

echo "======================================================================"
echo "✅ Update complete! Fresh build is now active on https://admafia.marketing"
echo "💡 Tip: Hard-refresh your browser (Ctrl + Shift + R or Cmd + Shift + R) to view changes."
echo "======================================================================"

