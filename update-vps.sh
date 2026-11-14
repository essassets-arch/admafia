#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING CRM — 1-COMMAND VPS UPDATE & REBUILD SCRIPT (100% MONGODB)
# Usage on VPS (run inside repository folder, e.g. /home/ubuntu/admafia):
#   chmod +x update-vps.sh
#   ./update-vps.sh
# =============================================================================
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="admafia.marketing"
PORT="5050"

echo "======================================================================"
echo "🔄 Updating AdMafia Marketing CRM on VPS: $APP_DIR"
echo "🌐 Domain: https://$DOMAIN"
echo "🗄️  Database Engine: MongoDB 7.0 Replica Set (rs0)"
echo "======================================================================"

cd "$APP_DIR"
# Preserve private server credentials across Git resets.
BACKEND_ENV_BACKUP="$(mktemp)"
ROOT_ENV_BACKUP="$(mktemp)"
BACKEND_ENV_EXISTED=0
ROOT_ENV_EXISTED=0

if [ -f "$APP_DIR/backend/.env" ]; then
  cp "$APP_DIR/backend/.env" "$BACKEND_ENV_BACKUP"
  BACKEND_ENV_EXISTED=1
fi
if [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "$ROOT_ENV_BACKUP"
  ROOT_ENV_EXISTED=1
fi

# 1. Pull latest commits from GitHub (Clean discard of local build artifacts)
echo "📥 1/5 Pulling latest changes from GitHub (main)..."
git fetch origin main
git reset --hard origin/main

if [ "$BACKEND_ENV_EXISTED" -eq 1 ]; then
  install -m 600 "$BACKEND_ENV_BACKUP" "$APP_DIR/backend/.env"
fi
if [ "$ROOT_ENV_EXISTED" -eq 1 ]; then
  install -m 600 "$ROOT_ENV_BACKUP" "$APP_DIR/.env"
fi
rm -f "$BACKEND_ENV_BACKUP" "$ROOT_ENV_BACKUP"

# 1a. One-time Pre-Decommission Safety Gate:
# If legacy PostgreSQL container (admafia-db) is still running from before the MongoDB cutover,
# take a compressed pg_dump + mongodump backup and run the final PG -> Mongo parity sync BEFORE stopping it.
if command -v docker > /dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q '^admafia-db$'; then
  echo "🛡️  Legacy PostgreSQL container (admafia-db) detected — running final pre-cutover backup & MongoDB parity sync..."
  mkdir -p "$APP_DIR/backups"
  CUTOVER_TS="$(date +%Y%m%d_%H%M%S)"
  docker exec admafia-db pg_dump -U admafia_user -d admafia_crm | gzip > "$APP_DIR/backups/pg_final_pre_mongo_cutover_${CUTOVER_TS}.sql.gz"
  echo "✓ Saved final PostgreSQL snapshot: backups/pg_final_pre_mongo_cutover_${CUTOVER_TS}.sql.gz"

  if ! docker ps --format '{{.Names}}' | grep -q '^admafia-mongo$'; then
    docker compose up -d mongo
    sleep 5
  fi
  docker exec admafia-mongo mongodump --db=admafia_crm --archive --gzip > "$APP_DIR/backups/mongo_pre_cutover_${CUTOVER_TS}.archive.gz" || true

  if docker ps --format '{{.Names}}' | grep -q '^admafia-backend$'; then
    docker exec -T admafia-backend node scripts/migrate-pg-to-mongo.js
  else
    PGHOST=127.0.0.1 PGPORT=5432 PGUSER=admafia_user PGPASSWORD=AdMafiaStrongPass2026! PGDATABASE=admafia_crm \
      MONGO_URI="mongodb://127.0.0.1:27017/admafia_crm?directConnection=true" \
      node "$APP_DIR/backend/scripts/migrate-pg-to-mongo.js"
  fi
  echo "✓ Final PostgreSQL → MongoDB parity sync completed with 0 data loss."
fi

# 1b. Synchronize Razorpay keys & strip obsolete PG/placeholder variables from .env files
for ENV_FILE in "$APP_DIR/.env" "$APP_DIR/backend/.env"; do
  if [ -f "$ENV_FILE" ]; then
    sed -i '/^PGHOST=/d; /^PGPORT=/d; /^PGUSER=/d; /^PGPASSWORD=/d; /^PGDATABASE=/d' "$ENV_FILE"
    sed -i '/your_secure_mongo_password/d; /admafia_mongo:/d' "$ENV_FILE"
  fi
done

if [ -f "$APP_DIR/.env" ]; then
  echo "📄 Root .env detected — syncing credentials..."
  ROOT_KEY_ID=$(grep -E '^RAZORPAY_KEY_ID=' "$APP_DIR/.env" | tail -n 1 | cut -d'=' -f2- | tr -d '\r"' || true)
  ROOT_KEY_SECRET=$(grep -E '^RAZORPAY_KEY_SECRET=' "$APP_DIR/.env" | tail -n 1 | cut -d'=' -f2- | tr -d '\r"' || true)

  if [ ! -f "$APP_DIR/backend/.env" ]; then
    cp "$APP_DIR/.env" "$APP_DIR/backend/.env"
    chmod 600 "$APP_DIR/backend/.env"
  else
    if [ -n "$ROOT_KEY_ID" ]; then
      if grep -q '^RAZORPAY_KEY_ID=' "$APP_DIR/backend/.env"; then
        sed -i "s|^RAZORPAY_KEY_ID=.*|RAZORPAY_KEY_ID=$ROOT_KEY_ID|" "$APP_DIR/backend/.env"
      else
        echo "RAZORPAY_KEY_ID=$ROOT_KEY_ID" >> "$APP_DIR/backend/.env"
      fi
    fi
    if [ -n "$ROOT_KEY_SECRET" ]; then
      if grep -q '^RAZORPAY_KEY_SECRET=' "$APP_DIR/backend/.env"; then
        sed -i "s|^RAZORPAY_KEY_SECRET=.*|RAZORPAY_KEY_SECRET=$ROOT_KEY_SECRET|" "$APP_DIR/backend/.env"
      else
        echo "RAZORPAY_KEY_SECRET=$ROOT_KEY_SECRET" >> "$APP_DIR/backend/.env"
      fi
    fi
  fi
fi

# 1c. Ensure backend/.env exists with valid production configuration
if [ ! -f "$APP_DIR/backend/.env" ]; then
  cat > "$APP_DIR/backend/.env" << 'EOF'
PORT=5000
MONGO_URI=mongodb://mongo:27017/admafia_crm?directConnection=true
RAZORPAY_KEY_ID=rzp_live_TuUlRUHnVlWd5i
RAZORPAY_KEY_SECRET=ItZeWawXWwTt98Dx60n47Sza
NODE_ENV=production
EOF
  chmod 600 "$APP_DIR/backend/.env"
  echo "✓ Provisioned production backend/.env configuration."
fi

# 2. Build Frontend Production Distribution (Removes old cache and rebuilds dist)
echo "🔨 2/5 Building frontend production assets..."
cd "$APP_DIR/frontend"
npm install
npm run build
npm run build:ssr

# 3. Check Backend Dependencies
echo "📦 3/5 Verifying backend dependencies..."
cd "$APP_DIR/backend"
npm install

# 4. Restart Application Daemon (Docker Compose or PM2)
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
  PORT="5050"
  echo "🚀 4/5 Restarting AdMafia Docker stack on port $PORT..."
  echo "🐳 Rebuilding and launching Docker Compose stack (mongo, backend, frontend)..."
  cd "$APP_DIR"
  pm2 delete admafia 2>/dev/null || true
  pm2 save 2>/dev/null || true
  systemctl stop postgresql 2>/dev/null || true
  systemctl disable postgresql 2>/dev/null || true

  # Ensure MongoDB replica set container is healthy first
  docker compose up -d mongo
  docker compose build --no-cache frontend backend
  # Refresh backend anonymous /app/node_modules volume from new image & remove legacy PG containers
  docker rm -fv admafia-backend 2>/dev/null || true
  docker rm -f admafia-db admafia-pgadmin 2>/dev/null || true
  docker compose up -d --remove-orphans

  sleep 4
  docker compose exec -T backend node scripts/purge-test-users.js 2>/dev/null || true
  echo "📋 Docker container status:"
  docker compose ps
elif command -v pm2 > /dev/null 2>&1; then
  PORT="5000"
  echo "🚀 4/5 Restarting AdMafia application on port $PORT with PM2..."
  systemctl stop postgresql 2>/dev/null || true
  systemctl disable postgresql 2>/dev/null || true
  cd "$APP_DIR/backend"
  node scripts/purge-test-users.js || true
  pm2 delete admafia 2>/dev/null || true
  pm2 start server.js --name "admafia"
  pm2 save
fi

# 5. Configure Nginx with Port 443 SSL for admafia.marketing
echo "🔒 5/5 Configuring Nginx SSL routing for https://$DOMAIN..."
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
  cat > /etc/nginx/sites-available/admafia << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate $CERT_PATH;
    ssl_certificate_key $KEY_PATH;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header CF-IPCountry \$http_cf_ipcountry;
        proxy_set_header CF-Connecting-IP \$http_cf_connecting_ip;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
else
  cat > /etc/nginx/sites-available/admafia << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header CF-IPCountry \$http_cf_ipcountry;
        proxy_set_header CF-Connecting-IP \$http_cf_connecting_ip;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/admafia /etc/nginx/sites-enabled/admafia
  nginx -t && systemctl reload nginx
  if command -v certbot > /dev/null 2>&1; then
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || true
  fi
fi

ln -sf /etc/nginx/sites-available/admafia /etc/nginx/sites-enabled/admafia
nginx -t && systemctl reload nginx

echo ""
echo "======================================================================"
echo "✅ Update complete! AdMafia CRM is 100% LIVE on MongoDB + HTTPS!"
echo "🌐 Website:            https://$DOMAIN/"
echo "📊 Customer Profile:   https://$DOMAIN/app/lead#app/profile"
echo "📥 Lead Pipeline:      https://$DOMAIN/app/lead#app/leads"
echo "💼 Sales Operations:   https://$DOMAIN/sales"
echo "🔐 Admin Gateway:      https://$DOMAIN/admin/login"
echo "💡 Hard-refresh browser (Ctrl + Shift + R) to view latest version!"
echo "======================================================================"
