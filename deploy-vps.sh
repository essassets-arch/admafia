#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING CRM — VPS DEPLOYMENT SCRIPT
# Usage on VPS:
#   chmod +x deploy-vps.sh
#   ./deploy-vps.sh [DOMAIN]
# =============================================================================
set -e

DOMAIN="${1:-admafia.marketing}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="5050"
DB_NAME="admafia_crm"
DB_USER="admafia_user"
DB_PASS="AdMafiaStrongPass2026!"

echo "🚀 Starting VPS Deployment in $APP_DIR for domain: $DOMAIN"

# 1. Ensure PostgreSQL, Nginx, Certbot & PM2 are installed
apt-get update -y
apt-get install -y curl git nginx postgresql postgresql-contrib certbot python3-certbot-nginx
if ! command -v node > /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pm2 > /dev/null; then
  npm install -g pm2
fi

# 2. Configure PostgreSQL Database & User
systemctl start postgresql
systemctl enable postgresql

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

# 3. Install Backend Dependencies & Initialize PostgreSQL Schema
cd "$APP_DIR/backend"
cat > .env <<EOF
PORT=$PORT
PGHOST=localhost
PGPORT=5432
PGUSER=$DB_USER
PGPASSWORD=$DB_PASS
PGDATABASE=$DB_NAME
EOF

npm install
npm run db:init

# 4. Install Frontend Dependencies & Build Production Bundle
cd "$APP_DIR/frontend"
cat > .env <<EOF
VITE_API_BASE_URL=/api
EOF

npm install
npm run build
npm run build:ssr

# 5. Start Backend + Frontend Server with PM2 on Port 5050
cd "$APP_DIR/backend"
pm2 delete admafia 2>/dev/null || true
pm2 start server.js --name "admafia"
pm2 save

# 6. Configure Nginx Reverse Proxy for $DOMAIN -> 127.0.0.1:$PORT with SSL
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
  cat > /etc/nginx/sites-available/admafia <<EOF
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
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
else
  cat > /etc/nginx/sites-available/admafia <<EOF
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
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/admafia /etc/nginx/sites-enabled/admafia
  nginx -t && systemctl reload nginx
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || true
fi

ln -sf /etc/nginx/sites-available/admafia /etc/nginx/sites-enabled/admafia
nginx -t && systemctl reload nginx

echo "======================================================================"
echo "✅ AdMafia CRM is LIVE in $APP_DIR on Port $PORT!"
echo "🌐 Website:            https://$DOMAIN"
echo "🔐 Login:              https://$DOMAIN/#login"
echo "📝 Register:           https://$DOMAIN/#register"
echo "📊 Customer Profile:   https://$DOMAIN/app/lead#app/profile"
echo "💼 Sales Desk:         https://$DOMAIN/sales"
echo "======================================================================"
