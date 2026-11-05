#!/usr/bin/env bash
# Adds ONLY the schcentral.com site to nginx. Tests the config first and rolls back on any error.
set -euo pipefail
CONF=/etc/nginx/sites-available/schcentral.com
LINK=/etc/nginx/sites-enabled/schcentral.com

if [ -e "$CONF" ]; then echo "$CONF already exists. Not touching it."; exit 1; fi

cat > "$CONF" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name schcentral.com www.schcentral.com;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3070;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -s "$CONF" "$LINK"

if nginx -t; then
  systemctl reload nginx
  echo "schcentral.com added to nginx."
  echo "After DNS points to this server, run:"
  echo "  certbot --nginx -d schcentral.com -d www.schcentral.com"
else
  rm -f "$LINK" "$CONF"
  echo "nginx test failed. The new site was removed and nginx was NOT reloaded."
  exit 1
fi
