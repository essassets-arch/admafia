#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING CRM — AUTOMATED VPS DEPLOYMENT SCRIPT (Ubuntu / Debian)
# Usage on VPS:
#   chmod +x deploy-vps.sh
#   sudo ./deploy-vps.sh yourdomain.com
# =============================================================================
set -e

DOMAIN="${1:-yourdomain.com}"
APP_DIR="/var/www/admafia"
DB_NAME="admafia_crm"
DB_USER="admafia_user"
DB_PASS="AdMafiaStrongPass2026!"

echo "🚀 Starting VPS Deployment for domain: $DOMAIN"

# 1. Install Node.js 20, PostgreSQL, Nginx, Certbot & PM2
apt-get update -y
apt-get install -y curl git nginx postgresql postgresql-contrib certbot python3-certbot-nginx
if ! command -v node > /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

# 2. Configure PostgreSQL Database & User
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# 3. Install Backend Dependencies & Initialize PostgreSQL Schema
cd "$APP_DIR/backend"
cat > .env <<EOF
PORT=5000
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

# 5. Start Backend Server with PM2 (Auto-Restart on Reboot)
cd "$APP_DIR/backend"
pm2 delete admafia-backend 2>/dev/null || true
pm2 start server.js --name "admafia-backend"
pm2 save
pm2 startup systemd -u root --hp /root || true

# 6. Configure Nginx Reverse Proxy + SPA Routing (/portal, /sales, /api)
cat > /etc/nginx/sites-available/admafia <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root $APP_DIR/frontend/dist;
    index index.html;

    # Backend API Proxy -> Node.js Express + PostgreSQL on port 5000
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # React SPA Routes (/, /portal, /sales, /app/lead)
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/admafia /etc/nginx/sites-enabled/admafia
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "✅ Deployment Complete! Visit: http://$DOMAIN"
echo "🔒 To enable free HTTPS SSL, run: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"

