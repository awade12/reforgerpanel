#!/usr/bin/env bash
# One-shot production install for a fresh Ubuntu VPS (22.04+).
# Requires a public domain — Caddy + Let's Encrypt are mandatory.
# Run from a cloned repo: sudo bash scripts/install-vps.sh --domain panel.example.com
set -euo pipefail

DOMAIN=""
CADDY_EMAIL=""
WITH_BOT=0
WITH_UFW=1
SKIP_BUILD=0
SKIP_GAME=0
SKIP_HTTPS_WAIT=0
EXISTING=0

usage() {
  cat <<'EOF'
Usage: sudo bash scripts/install-vps.sh --domain HOST [options]

Required:
  --domain HOST     Public hostname for the panel (e.g. panel.example.com)
                    DNS A record must point at this VPS before install.

Options:
  --email ADDR      ACME/Let's Encrypt contact email (recommended)
  --with-bot        Enable and start the Discord bot systemd unit
  --no-ufw          Do not configure UFW (you manage firewall elsewhere)
  --skip-build      Skip npm run build (dev only)
  --skip-game       Skip SteamCMD game server download (~10+ GB)
  --skip-https-wait Skip post-install HTTPS verification
  --existing        Cutover mode: skip bootstrap/postgres/deps/secrets regen (this machine already set up)
  -h, --help        Show this help

Example:
  sudo mkdir -p /opt/reforgerpanel && sudo chown \$USER:\$USER /opt/reforgerpanel
  git clone https://github.com/awade12/reforgerpanel.git /opt/reforgerpanel
  cd /opt/reforgerpanel
  sudo bash scripts/install-vps.sh --domain panel.example.com --email admin@example.com
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?missing domain}"; shift 2 ;;
    --email) CADDY_EMAIL="${2:?missing email}"; shift 2 ;;
    --with-bot) WITH_BOT=1; shift ;;
    --no-ufw) WITH_UFW=0; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-game) SKIP_GAME=1; shift ;;
    --skip-https-wait) SKIP_HTTPS_WAIT=1; shift ;;
    --existing) EXISTING=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${DOMAIN}" ]]; then
  echo "Error: --domain is required for production install (HTTPS via Caddy)." >&2
  echo "Point a DNS A record at this server, then re-run with --domain panel.example.com" >&2
  usage
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/install-vps.sh --domain ${DOMAIN}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${INSTALL_DIR}/package.json" ]]; then
  echo "No package.json in ${INSTALL_DIR}" >&2
  exit 1
fi

PANEL_USER="${SUDO_USER:-${PANEL_USER:-ubuntu}}"
if ! id "${PANEL_USER}" &>/dev/null; then
  echo "User ${PANEL_USER} does not exist. Set SUDO_USER or create the user first." >&2
  exit 1
fi

PANEL_HOME="$(getent passwd "${PANEL_USER}" | cut -d: -f6)"
ENV_FILE="/etc/reforgerpanel/env"
LOG_FILE="/var/log/reforgerpanel-install.log"
PANEL_PORT=3000

log() {
  echo "[install] $*"
  echo "[$(date -Iseconds)] $*" >>"${LOG_FILE}"
}

if [[ ! -O "${INSTALL_DIR}" ]] && [[ "$(stat -c '%U' "${INSTALL_DIR}")" == "root" ]]; then
  log "Fixing ownership of ${INSTALL_DIR} (clone with sudo left files owned by root)"
  chown -R "${PANEL_USER}:${PANEL_USER}" "${INSTALL_DIR}"
fi

random_hex() {
  openssl rand -hex 32
}

random_password() {
  openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "${major}" -ge 20 ]]; then
      log "Node $(node -v) already installed"
      return
    fi
  fi
  log "Installing Node.js 22.x…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
}

install_caddy() {
  if command -v caddy >/dev/null 2>&1; then
    log "Caddy already installed"
  else
    log "Installing Caddy from official repository…"
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update
    apt-get install -y caddy
  fi
}

finalize_env_permissions() {
  chown root:"${PANEL_USER}" "${ENV_FILE}"
  chmod 640 "${ENV_FILE}"
}

ensure_env_secrets() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    mkdir -p /etc/reforgerpanel
    touch "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
  fi

  set_env() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
      if grep -q "^${key}=change-me" "${ENV_FILE}" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
      fi
    else
      echo "${key}=${value}" >>"${ENV_FILE}"
    fi
  }

  set_env "AGENT_TOKEN" "$(random_hex)"
  set_env "SESSION_SECRET" "$(random_hex)"
  set_env "SECRETS_ENCRYPTION_KEY" "$(random_hex)"
  if ! grep -q '^ADMIN_PASSWORD=' "${ENV_FILE}" 2>/dev/null; then
    echo "ADMIN_PASSWORD=$(random_password)" >>"${ENV_FILE}"
  elif grep -q '^ADMIN_PASSWORD=admin$' "${ENV_FILE}" 2>/dev/null; then
    sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(random_password)|" "${ENV_FILE}"
  fi

  grep -q '^AGENT_URL=' "${ENV_FILE}" || echo "AGENT_URL=http://127.0.0.1:9100" >>"${ENV_FILE}"
  grep -q '^AGENT_HOST=' "${ENV_FILE}" || echo "AGENT_HOST=127.0.0.1" >>"${ENV_FILE}"
  grep -q '^AGENT_PORT=' "${ENV_FILE}" || echo "AGENT_PORT=9100" >>"${ENV_FILE}"
  grep -q '^REFORGER_ROOT=' "${ENV_FILE}" || echo "REFORGER_ROOT=/opt/reforger" >>"${ENV_FILE}"
  grep -q '^STEAMCMD_PATH=' "${ENV_FILE}" || echo "STEAMCMD_PATH=/opt/reforger/steamcmd/steamcmd.sh" >>"${ENV_FILE}"
  if grep -q '^STEAMCMD_PATH=/usr/local/bin/steamcmd' "${ENV_FILE}" 2>/dev/null; then
    sed -i 's|^STEAMCMD_PATH=.*|STEAMCMD_PATH=/opt/reforger/steamcmd/steamcmd.sh|' "${ENV_FILE}"
  fi
  grep -q '^PANEL_DATA_DIR=' "${ENV_FILE}" || echo "PANEL_DATA_DIR=/opt/reforger/panel-data" >>"${ENV_FILE}"
  grep -q '^PANEL_ROOT=' "${ENV_FILE}" || echo "PANEL_ROOT=${INSTALL_DIR}" >>"${ENV_FILE}"
  grep -q '^PORT=' "${ENV_FILE}" || echo "PORT=${PANEL_PORT}" >>"${ENV_FILE}"

  if grep -q '^HOSTNAME=' "${ENV_FILE}"; then
    sed -i "s|^HOSTNAME=.*|HOSTNAME=127.0.0.1|" "${ENV_FILE}"
  else
    echo "HOSTNAME=127.0.0.1" >>"${ENV_FILE}"
  fi

  if grep -q '^REFORGER_USER=' "${ENV_FILE}"; then
    sed -i "s|^REFORGER_USER=.*|REFORGER_USER=${PANEL_USER}|" "${ENV_FILE}"
  else
    echo "REFORGER_USER=${PANEL_USER}" >>"${ENV_FILE}"
  fi

  if grep -q '^PANEL_PUBLIC_URL=' "${ENV_FILE}"; then
    sed -i "s|^PANEL_PUBLIC_URL=.*|PANEL_PUBLIC_URL=https://${DOMAIN}|" "${ENV_FILE}"
  else
    echo "PANEL_PUBLIC_URL=https://${DOMAIN}" >>"${ENV_FILE}"
  fi
  if grep -q '^COOKIE_SECURE=' "${ENV_FILE}"; then
    sed -i "s|^COOKIE_SECURE=.*|COOKIE_SECURE=true|" "${ENV_FILE}"
  else
    echo "COOKIE_SECURE=true" >>"${ENV_FILE}"
  fi
  if grep -q '^PANEL_PUBLIC_HOST=' "${ENV_FILE}"; then
    sed -i "s|^PANEL_PUBLIC_HOST=.*|PANEL_PUBLIC_HOST=${DOMAIN}|" "${ENV_FILE}"
  else
    echo "PANEL_PUBLIC_HOST=${DOMAIN}" >>"${ENV_FILE}"
  fi

  chmod 600 "${ENV_FILE}"
  finalize_env_permissions
}

update_production_env() {
  if grep -q '^HOSTNAME=' "${ENV_FILE}"; then
    sed -i "s|^HOSTNAME=.*|HOSTNAME=127.0.0.1|" "${ENV_FILE}"
  else
    echo "HOSTNAME=127.0.0.1" >>"${ENV_FILE}"
  fi
  if grep -q '^PANEL_PUBLIC_URL=' "${ENV_FILE}"; then
    sed -i "s|^PANEL_PUBLIC_URL=.*|PANEL_PUBLIC_URL=https://${DOMAIN}|" "${ENV_FILE}"
  else
    echo "PANEL_PUBLIC_URL=https://${DOMAIN}" >>"${ENV_FILE}"
  fi
  if grep -q '^COOKIE_SECURE=' "${ENV_FILE}"; then
    sed -i "s|^COOKIE_SECURE=.*|COOKIE_SECURE=true|" "${ENV_FILE}"
  else
    echo "COOKIE_SECURE=true" >>"${ENV_FILE}"
  fi
  if grep -q '^PANEL_PUBLIC_HOST=' "${ENV_FILE}"; then
    sed -i "s|^PANEL_PUBLIC_HOST=.*|PANEL_PUBLIC_HOST=${DOMAIN}|" "${ENV_FILE}"
  else
    echo "PANEL_PUBLIC_HOST=${DOMAIN}" >>"${ENV_FILE}"
  fi
  grep -q '^PANEL_ROOT=' "${ENV_FILE}" || echo "PANEL_ROOT=${INSTALL_DIR}" >>"${ENV_FILE}"
  finalize_env_permissions
}

install_systemd_units() {
  local npm_path
  npm_path="$(command -v npm)"

  for unit in reforgerpanel-agent reforgerpanel reforgerpanel-bot; do
    sed \
      -e "s|/home/ubuntu/reforgerpanel|${INSTALL_DIR}|g" \
      -e "s|^User=ubuntu|User=${PANEL_USER}|g" \
      -e "s|ExecStart=/usr/bin/npm|ExecStart=${npm_path}|g" \
      "${INSTALL_DIR}/deploy/${unit}.service" >"/etc/systemd/system/${unit}.service"
  done

  echo "${PANEL_USER} ALL=(root) NOPASSWD: /usr/local/bin/reforger-ctl" >/etc/sudoers.d/reforgerpanel
  echo "${PANEL_USER} ALL=(root) NOPASSWD: /usr/bin/docker" >>/etc/sudoers.d/reforgerpanel
  echo "${PANEL_USER} ALL=(root) NOPASSWD: /usr/sbin/ufw, /usr/bin/ufw" >>/etc/sudoers.d/reforgerpanel
  echo "${PANEL_USER} ALL=(root) NOPASSWD: /bin/systemctl restart reforgerpanel-agent, /bin/systemctl restart reforgerpanel, /bin/systemctl restart reforgerpanel-bot, /bin/systemctl stop reforgerpanel, /bin/systemctl start reforgerpanel" >>/etc/sudoers.d/reforgerpanel
  chmod 440 /etc/sudoers.d/reforgerpanel
  visudo -cf /etc/sudoers.d/reforgerpanel
  systemctl daemon-reload
}

run_as_panel() {
  sudo -u "${PANEL_USER}" env HOME="${PANEL_HOME}" bash -lc "
    set -a
    source '${ENV_FILE}'
    set +a
    cd '${INSTALL_DIR}'
    $*
  "
}

configure_ufw() {
  if ! command -v ufw >/dev/null 2>&1; then
    apt-get install -y ufw
  fi
  ufw allow OpenSSH
  ufw allow 80/tcp comment 'Caddy HTTP (ACME + redirect)'
  ufw allow 443/tcp comment 'Caddy HTTPS'
  ufw --force enable
  log "UFW enabled: SSH, 80, 443 only (panel on localhost:${PANEL_PORT})"
}

setup_caddy() {
  mkdir -p /etc/reforgerpanel/caddy
  cp "${INSTALL_DIR}/deploy/caddy/Caddyfile.template" /etc/reforgerpanel/caddy/Caddyfile.template
  export CADDY_ADMIN_EMAIL="${CADDY_EMAIL}"
  bash "${SCRIPT_DIR}/caddy-setup.sh" "${DOMAIN}" "${PANEL_PORT}" "${INSTALL_DIR}/deploy/caddy/Caddyfile.template"
}

print_summary() {
  cat <<EOF

================================================================================
 Reforger Host installed (HTTPS)
================================================================================
  Install dir : ${INSTALL_DIR}
  Panel user  : ${PANEL_USER}
  Env file    : ${ENV_FILE}
  Panel URL   : https://${DOMAIN}

  First visit : https://${DOMAIN}/setup  (create master admin)

  Services:
    systemctl status caddy reforgerpanel-agent reforgerpanel
    journalctl -u caddy -f

  The web UI listens on 127.0.0.1:${PANEL_PORT} only — public access is via Caddy.

  Log: ${LOG_FILE}
================================================================================
EOF
}

touch "${LOG_FILE}"
log "Starting VPS install in ${INSTALL_DIR} as user ${PANEL_USER} (domain ${DOMAIN})"

log "Checking DNS for ${DOMAIN}…"
bash "${SCRIPT_DIR}/verify-dns.sh" "${DOMAIN}"

if [[ "${EXISTING}" -eq 0 ]]; then
  install_node
  log "Bootstrapping host (SteamCMD, /opt/reforger, systemd templates)…"
  bash "${SCRIPT_DIR}/bootstrap-host.sh"
  ensure_env_secrets
  log "Setting up PostgreSQL…"
  bash "${SCRIPT_DIR}/setup-postgres.sh"
else
  log "Existing machine mode — skipping bootstrap/postgres/secret generation"
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Missing ${ENV_FILE}. Run bootstrap first or use a full install." >&2
    exit 1
  fi
  update_production_env
fi

install_caddy

chown -R "${PANEL_USER}:reforger" "${INSTALL_DIR}" 2>/dev/null || chown -R "${PANEL_USER}:${PANEL_USER}" "${INSTALL_DIR}"
chmod +x "${INSTALL_DIR}/scripts/update-panel.sh" 2>/dev/null || true
chmod +x "${INSTALL_DIR}/scripts/ensure-panel-web.sh" 2>/dev/null || true

if [[ "${EXISTING}" -eq 0 ]]; then
  log "Installing npm dependencies…"
  run_as_panel "npm ci 2>/dev/null || npm install"
fi

if [[ "${SKIP_BUILD}" -eq 0 ]]; then
  log "Building Next.js panel (may take a few minutes on small VPS)…"
  run_as_panel "npm run build"
  if ! run_as_panel "test -f .next/BUILD_ID"; then
    echo "npm run build did not produce .next/BUILD_ID" >&2
    exit 1
  fi
fi

log "Initializing PostgreSQL schema…"
run_as_panel "npm run db:migrate"

install_systemd_units

systemctl enable caddy reforgerpanel-agent reforgerpanel
systemctl restart reforgerpanel-agent
sleep 2
systemctl restart reforgerpanel

if [[ "${WITH_BOT}" -eq 1 ]]; then
  systemctl enable reforgerpanel-bot
  systemctl restart reforgerpanel-bot
else
  systemctl disable reforgerpanel-bot 2>/dev/null || true
  systemctl stop reforgerpanel-bot 2>/dev/null || true
fi

if [[ "${WITH_UFW}" -eq 1 ]]; then
  configure_ufw
fi

log "Configuring Caddy reverse proxy + automatic HTTPS…"
setup_caddy

if [[ "${SKIP_HTTPS_WAIT}" -eq 0 ]]; then
  log "Waiting for Let's Encrypt certificate…"
  bash "${SCRIPT_DIR}/wait-for-https.sh" "${DOMAIN}" 36 5
fi

if [[ "${SKIP_GAME}" -eq 0 ]]; then
  log "Downloading Arma Reforger dedicated server (stable, ~10+ GB)…"
  log "This runs in the background — track with: tail -f ${LOG_FILE}"
  nohup bash -c "
    steamcmd +runscript /opt/reforger/steamcmd/update_stable.txt >>'${LOG_FILE}' 2>&1
    chown -R reforger:reforger /opt/reforger/server-stable
    chmod -R g+rwX /opt/reforger/server-stable
  " >/dev/null 2>&1 &
else
  log "Skipped game server download (--skip-game)"
fi

print_summary
log "Install complete"
