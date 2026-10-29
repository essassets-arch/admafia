#!/usr/bin/env bash
# =============================================================================
# ADMAFIA MARKETING — PGADMIN 4 WEB DATABASE BROWSER SETUP
# Configures https://admafia.marketing/dbadmin/browser/
# =============================================================================
set -e

echo "🚀 Installing & Configuring pgAdmin 4 Web DB Browser..."

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

# Fix permissions for pgadmin user (UID 5050 in container)
chmod 644 /home/stzk/admafia/pgadmin/servers.json

# 3. Run pgAdmin 4 Web Container on Port 5055
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

# 4. Configure Nginx for /dbadmin/ on both HTTP (80) and HTTPS (443)
python3 - << 'PYEOF'
import re

with open('/etc/nginx/sites-available/admafia', 'r') as f:
    text = f.read()

# Strip any existing /dbadmin blocks to prevent duplication
text = re.sub(r'\s*location\s*=?\s*/dbadmin[^{]*\{[^}]*\}', '', text)

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

# Place /dbadmin before every "location / {" block (for both port 80 and port 443)
new_text = text.replace('location / {', dbadmin_nginx + '\n    location / {')

with open('/etc/nginx/sites-available/admafia', 'w') as f:
    f.write(new_text)

print("Nginx configuration updated with /dbadmin/ proxy block.")
PYEOF

# 5. Test and reload Nginx
nginx -t
systemctl reload nginx

echo ""
echo "======================================================================"
echo "✅ pgAdmin 4 is successfully installed and configured!"
echo "🌐 URL:      https://admafia.marketing/dbadmin/browser/"
echo "📧 Email:    admin@admafia.marketing"
echo "🔑 Password: AdMafiaAdmin2026!"
echo "🗄️  DB Pass:  AdMafiaStrongPass2026!"
echo "======================================================================"
