#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING — PGADMIN 4 WEB DATABASE BROWSER SETUP
# Configures https://admafia.marketing/dbadmin/browser/
# =============================================================================
set -e

echo "🚀 Starting pgAdmin 4 installation & Nginx configuration..."

# 1. Stop any existing container
docker rm -f admafia-pgadmin 2>/dev/null || true

# 2. Configure pre-registered server in pgAdmin
mkdir -p /home/stzk/admafia/pgadmin
cat > /home/stzk/admafia/pgadmin/servers.json << 'EOF'
{
  "Servers": {
    "1": {
      "Name": "AdMafia CRM",
      "Group": "Servers",
      "Host": "127.0.0.1",
      "Port": 5432,
      "MaintenanceDB": "admafia_crm",
      "Username": "admafia_user",
      "SSLMode": "prefer"
    }
  }
}
EOF
chmod 644 /home/stzk/admafia/pgadmin/servers.json

# 3. Pull & Run pgAdmin 4 Container on Port 5055
echo "📦 Pulling and starting pgAdmin 4 container..."
docker run -d \
  --name admafia-pgadmin \
  --restart always \
  --network="host" \
  -e "PGADMIN_LISTEN_PORT=5055" \
  -e "PGADMIN_DEFAULT_EMAIL=admin@admafia.marketing" \
  -e "PGADMIN_DEFAULT_PASSWORD=AdMafiaAdmin2026!" \
  -e "SCRIPT_NAME=/dbadmin" \
  -v /home/stzk/admafia/pgadmin/servers.json:/pgadmin4/servers.json:ro \
  dpage/pgadmin4:latest

# 4. Configure Nginx for /dbadmin in ALL relevant Nginx config files (HTTP & HTTPS)
echo "⚙️ Configuring Nginx reverse proxy for /dbadmin/..."
python3 - << 'PYEOF'
import glob, re, os

dbadmin_nginx = """
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
"""

# Check all site config files in sites-available and sites-enabled
files = set(glob.glob('/etc/nginx/sites-available/*admafia*') + glob.glob('/etc/nginx/sites-enabled/*admafia*'))

for filepath in files:
    if os.path.islink(filepath):
        continue  # skip symlinks to avoid duplicate writes
    try:
        with open(filepath, 'r') as f:
            text = f.read()

        # Clean old /dbadmin blocks
        text = re.sub(r'\s*location\s*=?\s*/dbadmin[^{]*\{[^}]*\}', '', text)

        # Insert before every "location / {"
        if 'location / {' in text:
            new_text = text.replace('location / {', dbadmin_nginx + '\n    location / {')
            with open(filepath, 'w') as f:
                f.write(new_text)
            print(f"  ✓ Updated {filepath}")
    except Exception as e:
        print(f"  ! Error updating {filepath}: {e}")
PYEOF

# 5. Reload Nginx
nginx -t
systemctl reload nginx

# 6. Wait for pgAdmin container to initialize
echo "⏳ Waiting for pgAdmin to initialize (approx 10-15 seconds)..."
for i in {1..20}; do
  if curl -s http://127.0.0.1:5055/dbadmin/misc/ping >/dev/null 2>&1 || curl -s http://127.0.0.1:5055/dbadmin/ >/dev/null 2>&1; then
    echo "  ✓ pgAdmin is responding on port 5055!"
    break
  fi
  sleep 2
done

echo ""
echo "======================================================================"
echo "✅ pgAdmin 4 is LIVE!"
echo "🌐 URL:      https://admafia.marketing/dbadmin/browser/"
echo "📧 Email:    admin@admafia.marketing"
echo "🔑 Password: AdMafiaAdmin2026!"
echo "🗄️  DB Pass:  AdMafiaStrongPass2026!"
echo "======================================================================"
