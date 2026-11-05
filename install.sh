#!/usr/bin/env bash
# On Time Credit Academy - first-time install. Run from /opt/academy:  bash install.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then echo "Docker is not installed."; exit 1; fi
if ss -ltn 2>/dev/null | grep -q ':3070 '; then echo "Port 3070 is already in use. Stop whatever uses it first."; exit 1; fi

if [ -f .env ]; then
  echo ".env already exists, keeping it."
else
  read -r -p "Admin email (your sign-in): " ADMIN_EMAIL
  read -r -p "Admin first name: " ADMIN_FIRST_NAME
  read -r -p "Admin last name: " ADMIN_LAST_NAME
  while true; do
    read -r -s -p "Admin password (10+ characters, no spaces or \$ \" ' \\ # characters): " ADMIN_PASSWORD; echo
    if [ "${#ADMIN_PASSWORD}" -lt 10 ]; then echo "Too short."; continue; fi
    if printf '%s' "$ADMIN_PASSWORD" | grep -q '[[:space:]$"'"'"'\\#`]'; then echo "Contains a character that is not allowed."; continue; fi
    break
  done
  DB_PASSWORD="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  umask 077
  cat > .env <<EOF
DB_PASSWORD=${DB_PASSWORD}
BASE_URL=https://schcentral.com
COOKIE_SECURE=true
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_FIRST_NAME=${ADMIN_FIRST_NAME}
ADMIN_LAST_NAME=${ADMIN_LAST_NAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
  chmod 600 .env
  echo ".env written (private to root)."
fi

docker compose up -d --build
echo "Waiting for the app..."
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3070/healthz >/dev/null 2>&1; then
    echo "Academy is running on 127.0.0.1:3070"
    echo "Next: bash nginx.sh"
    exit 0
  fi
  sleep 2
done
echo "The app did not answer in time. Look at: docker compose logs --tail 50"
exit 1
