#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING CRM — FULL DOCKER COMPOSE DEPLOYMENT SCRIPT
# Usage on VPS:
#   chmod +x deploy-docker.sh
#   ./deploy-docker.sh [DOMAIN]
# =============================================================================
set -e

DOMAIN="${1:-admafia.marketing}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================================================"
echo "🚀 Launching AdMafia CRM Docker Stack (Postgres + Backend + Frontend + pgAdmin)..."
echo "📂 App Directory: $APP_DIR"
echo "🌐 Domain:        $DOMAIN"
echo "======================================================================"

# 0. Ensure git, curl, nginx, certbot & docker are installed
if ! command -v git > /dev/null 2>&1 || ! command -v curl > /dev/null 2>&1 || ! command -v nginx > /dev/null 2>&1 || ! command -v certbot > /dev/null 2>&1; then
  echo "📦 Installing prerequisites (git, curl, nginx, certbot)..."
  apt-get update -y
  apt-get install -y git curl nginx certbot python3-certbot-nginx
fi

if ! command -v docker > /dev/null 2>&1; then
  echo "🐳 Installing Docker Engine & Compose plugin..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

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

# 1. Reset local uncommitted files to avoid git merge conflicts
git reset --hard origin/main 2>/dev/null || true
git pull origin main 2>/dev/null || true

if [ "$BACKEND_ENV_EXISTED" -eq 1 ]; then
  install -m 600 "$BACKEND_ENV_BACKUP" "$APP_DIR/backend/.env"
fi
if [ "$ROOT_ENV_EXISTED" -eq 1 ]; then
  install -m 600 "$ROOT_ENV_BACKUP" "$APP_DIR/.env"
fi
rm -f "$BACKEND_ENV_BACKUP" "$ROOT_ENV_BACKUP"

# Synchronize keys if root .env was defined
if [ -f "$APP_DIR/.env" ]; then
  ROOT_KEY_ID=$(grep -E '^RAZORPAY_KEY_ID=' "$APP_DIR/.env" | tail -n 1 | cut -d'=' -f2- | tr -d '\r"' || true)
  ROOT_KEY_SECRET=$(grep -E '^RAZORPAY_KEY_SECRET=' "$APP_DIR/.env" | tail -n 1 | cut -d'=' -f2- | tr -d '\r"' || true)
  if [ ! -f "$APP_DIR/backend/.env" ]; then
    cp "$APP_DIR/.env" "$APP_DIR/backend/.env"
  else
    if [ -n "$ROOT_KEY_ID" ]; then
      sed -i "s|^RAZORPAY_KEY_ID=.*|RAZORPAY_KEY_ID=$ROOT_KEY_ID|" "$APP_DIR/backend/.env" || echo "RAZORPAY_KEY_ID=$ROOT_KEY_ID" >> "$APP_DIR/backend/.env"
    fi
    if [ -n "$ROOT_KEY_SECRET" ]; then
      sed -i "s|^RAZORPAY_KEY_SECRET=.*|RAZORPAY_KEY_SECRET=$ROOT_KEY_SECRET|" "$APP_DIR/backend/.env" || echo "RAZORPAY_KEY_SECRET=$ROOT_KEY_SECRET" >> "$APP_DIR/backend/.env"
    fi
  fi
fi

# 1b. Keep payment credentials in the private backend/.env file. Never overwrite it during deploy.
if [ ! -f "$APP_DIR/backend/.env" ] \
  || ! grep -Eq '^RAZORPAY_KEY_ID=rzp_(test|live)_.+' "$APP_DIR/backend/.env" \
  || ! grep -Eq '^RAZORPAY_KEY_SECRET=.+$' "$APP_DIR/backend/.env"; then
  echo "ERROR: backend/.env must contain the Razorpay key ID and its matching secret."
  echo "Copy backend/.env.example to backend/.env and set the credentials privately before deploying."
  exit 1
fi

# 2. Stop host PM2 process if running to free port 5050/5000
pm2 delete admafia 2>/dev/null || true
pm2 save 2>/dev/null || true

# 3. Stop host postgresql service if running to free port 5432 for the Docker container
systemctl stop postgresql 2>/dev/null || true
systemctl disable postgresql 2>/dev/null || true

# 4. Build and start all 4 Docker containers
echo "📦 Building & starting containers..."
docker compose build --no-cache frontend backend
docker compose up -d

# 5. Configure Host Nginx Reverse Proxy for https://admafia.marketing
echo "⚙️ Configuring Host Nginx reverse proxy..."

if [ -f "/etc/letsencrypt/live/admafia.marketing/fullchain.pem" ]; then
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

    # Uploaded Media Assets (Direct to backend static storage)
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
else
cat > /etc/nginx/sites-available/admafia << 'EOF'
server {
    listen 80;
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
echo "🔒 Automatically requesting SSL Certificate from Let's Encrypt for https://$DOMAIN..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m admin@admafia.marketing --redirect || true
fi

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
