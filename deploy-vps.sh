#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING CRM — VPS DEPLOYMENT SCRIPT (100% MONGODB 7.0)
# Usage on VPS:
#   chmod +x deploy-vps.sh
#   ./deploy-vps.sh [DOMAIN]
# =============================================================================
set -e

DOMAIN="${1:-admafia.marketing}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================================================"
echo "🚀 Starting VPS Deployment for AdMafia CRM (100% MongoDB 7.0 Stack)"
echo "📂 App Directory: $APP_DIR"
echo "🌐 Domain:        $DOMAIN"
echo "======================================================================"

chmod +x "$APP_DIR/deploy-docker.sh"
exec "$APP_DIR/deploy-docker.sh" "$DOMAIN"
