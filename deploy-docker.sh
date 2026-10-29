#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING CRM — FULL DOCKER COMPOSE DEPLOYMENT SCRIPT
# Runs on VPS (root@vmi3189237:/home/stzk/admafia#):
#   ./deploy-docker.sh
# =============================================================================
set -e

DOMAIN="admafia.marketing"
APP_DIR="/home/stzk/admafia"

echo "======================================================================"
echo "🚀 Launching AdMafia CRM Docker Stack (Postgres + Backend + Frontend + pgAdmin)..."
echo "======================================================================"

cd "$APP_DIR"

# 1. Stop host PM2 process if running to free port 5050/5000
pm2 delete admafia 2>/dev/null || true
pm2 save 2>/dev/null || true

# 2. Stop host postgresql service if running to free port 5432 for the Docker container
systemctl stop postgresql 2>/dev/null || true
systemctl disable postgresql 2>/dev/null || true

# 3. Ensure Docker and Docker Compose Plugin are installed
if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | bash -
fi

if ! docker compose version > /dev/null 2>&1; then
  apt-get update -y && apt-get install -y docker-compose-plugin
fi

# 4. Build and start all 4 Docker containers
echo "📦 Building & starting containers..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# 5. Configure Host Nginx Reverse Proxy for the domain
echo "⚙️ Configuring Host Nginx reverse proxy..."
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
    ssl_certificate /etc/letsencrypt/live/admafia.marketing/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admafia.marketing/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = admafia.marketing) {
        return 301 https://$host$request_uri;
    }

    if ($host = www.admafia.marketing) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name admafia.marketing www.admafia.marketing;
    return 404;
}
EOF

ln -sf /etc/nginx/sites-available/admafia /etc/nginx/sites-enabled/admafia
nginx -t
systemctl reload nginx

echo ""
echo "======================================================================"
echo "🎉 ALL DOCKER SERVICES ARE UP & RUNNING!"
echo "======================================================================"
docker compose ps
echo ""
echo "🌐 Main Website:       https://admafia.marketing/"
echo "🔐 Customer Login:      https://admafia.marketing/#login"
echo "📝 Customer Register:   https://admafia.marketing/#register"
echo "📊 Customer Workspace:  https://admafia.marketing/portal"
echo "💼 Sales Desk:          https://admafia.marketing/sales"
echo "🗄️  pgAdmin 4 Web DB:   https://admafia.marketing/dbadmin/browser/"
echo "   - Email:             admin@admafia.marketing"
echo "   - Password:          AdMafiaAdmin2026!"
echo "   - DB Password:       AdMafiaStrongPass2026!"
echo "======================================================================"
