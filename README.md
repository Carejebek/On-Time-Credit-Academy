# On Time Credit Academy

Learning platform for the 8-week Credit Analyst Bootcamp (cohorts of 10, maximum 15).

Node 22, Express, PostgreSQL, Docker Compose. Runs on port 3070 behind nginx at schcentral.com.

## First install (on the server)
    git clone https://github.com/Carejebek/On-Time-Credit-Academy.git /opt/academy
    cd /opt/academy && bash install.sh
    bash nginx.sh

## Update
    cd /opt/academy && git pull && docker compose up -d --build

Secrets live only in `.env` on the server, which is never committed.
