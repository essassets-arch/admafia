#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING CRM — DOMAIN ROUTING & HTTPS / SSL FIX
# Fixes https://admafia.marketing/ to route directly to AdMafia CRM
# =============================================================================
set -e

DOMAIN="admafia.marketing"
APP_DIR="/home/stzk/admafia"

echo "======================================================================"
echo "🚀 Routing https://$DOMAIN to AdMafia Marketing CRM..."
echo "======================================================================"

cd "$APP_DIR"

# 1. Pull latest code cleanly
git fetch origin main 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || true

# 2. Stop conflicting PM2 / host postgresql to free ports
pm2 delete admafia 2>/dev/null || true
pm2 save 2>/dev/null || true
systemctl stop postgresql 2>/dev/null || true
systemctl disable postgresql 2>/dev/null || true

# 3. Build & start Docker containers
echo "📦 Starting AdMafia Docker Stack..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# Wait for frontend container on 5050 to become ready
echo "⏳ Waiting for containers to be ready..."
sleep 4

# 4. Check if certbot SSL certificates exist for admafia.marketing
CERT_PATH="/etc/letsencrypt/live/admafia.marketing/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/admafia.marketing/privkey.pem"

if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
  echo "🔒 Existing SSL certificates found for $DOMAIN. Configuring HTTPS on port 443..."
  cat > /etc/nginx/sites-available/admafia << 'EOF'
server {
    server_name admafia.marketing www.admafia.marketing;

    client_max_body_size 50M;

    # pgAdmin 4 Web DB Browser
    location = /dbadmin {
        return 301 /dbadmin/;
    }

    location /dbadmin/ {
        proxy_pass http://127.0.0.1:5055;
        proxy_http_version 1.1;
        proxy_set_header X-Script-Name /dbadmin;
        proxy_set_header X-Scheme $scheme;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }

    # Backend REST API
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploaded Media Assets
    location /uploads/ {
        proxy_pass http://127.0.0.1:5000/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend React SPA
    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/admafia.marketing/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admafia.marketing/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    listen 80;
    listen [::]:80;
    server_name admafia.marketing www.admafia.marketing;
    return 301 https://$host$request_uri;
}
EOF
else
  echo "🔒 No SSL cert found yet. Configuring HTTP and requesting certificate from Let's Encrypt..."
  cat > /etc/nginx/sites-available/admafia << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name admafia.marketing www.admafia.marketing;

    client_max_body_size 50M;

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/admafia /etc/nginx/sites-enabled/admafia
  nginx -t && systemctl reload nginx
  certbot --nginx -d admafia.marketing -d www.admafia.marketing --non-interactive --agree-tos -m admin@admafia.marketing --redirect || true
fi

# 5. Enable site in Nginx and reload
ln -sf /etc/nginx/sites-available/admafia /etc/nginx/sites-enabled/admafia
nginx -t
systemctl reload nginx

echo ""
echo "======================================================================"
echo "🎉 AdMafia Marketing CRM is now LIVE on HTTPS!"
echo "======================================================================"
echo "🌐 Website:            https://admafia.marketing/"
echo "📊 Customer Portal:     https://admafia.marketing/app/lead#app/dashboard"
echo "💼 Sales Desk:          https://admafia.marketing/sales"
echo "🔐 Admin Gateway:       https://admafia.marketing/admin/login"
echo "🗄️  pgAdmin Database:   https://admafia.marketing/dbadmin/browser/"
echo "======================================================================"

