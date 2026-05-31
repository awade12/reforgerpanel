#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/setup-postgres.sh"
  exit 1
fi

DB_NAME="${POSTGRES_DB:-reforgerpanel}"
DB_USER="${POSTGRES_USER:-reforgerpanel}"
DB_HOST="${POSTGRES_HOST:-127.0.0.1}"
DB_PORT="${POSTGRES_PORT:-5432}"
ENV_FILE="/etc/reforgerpanel/env"

apt-get update
apt-get install -y postgresql postgresql-contrib

systemctl enable --now postgresql

if [[ ! -f "${ENV_FILE}" ]]; then
  mkdir -p /etc/reforgerpanel
  touch "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
fi

if ! grep -q '^DATABASE_URL=' "${ENV_FILE}" 2>/dev/null; then
  DB_PASS="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\\gexec
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
  echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}" >>"${ENV_FILE}"
  echo "Added DATABASE_URL to ${ENV_FILE}"
else
  echo "DATABASE_URL already set in ${ENV_FILE} — skipping user/database creation"
fi

grep -q '^PANEL_DATA_DIR=' "${ENV_FILE}" || echo "PANEL_DATA_DIR=/opt/reforger/panel-data" >>"${ENV_FILE}"

mkdir -p /opt/reforger/panel-data
chown -R "${SUDO_USER:-ubuntu}:reforger" /opt/reforger/panel-data 2>/dev/null || true

echo ""
echo "PostgreSQL is ready."
echo "Next steps (as ${SUDO_USER:-ubuntu}):"
echo "  cd /home/ubuntu/reforgerpanel"
echo "  npm run db:migrate          # import existing panel.json if present"
echo "  sudo systemctl restart reforgerpanel-agent reforgerpanel reforgerpanel-bot"
