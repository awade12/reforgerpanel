#!/usr/bin/env bash
# Rehearse the production install on an existing machine without breaking
# running game servers or (by default) dev panel/agent/bot processes.
#
# Safe (default): validate scripts, DNS, Caddy config, production build, env checks.
# Cutover (--cutover): switch this VPS from dev terminals to systemd + Caddy.
set -euo pipefail

DOMAIN=""
CADDY_EMAIL=""
CUTOVER=0
SKIP_BUILD=0
USE_SSLIP=0

usage() {
  cat <<'EOF'
Usage: sudo bash scripts/rehearse-install.sh [options]

Rehearses the VPS install path. Safe mode does NOT stop dev servers or game instances.

Options:
  --domain HOST       Public hostname (required for DNS/TLS checks)
  --email ADDR        ACME contact email (for --cutover)
  --sslip             Use 15-204-234-121.sslip.io style hostname from this server's IP
                      (for testing only — use a real domain in production)
  --cutover           Actually migrate to systemd + Caddy (stops dev panel/agent on 3000/9100)
  --skip-build        Skip npm run build
  -h, --help          Show this help

Examples:
  # Safe dry run (recommended first):
  sudo bash scripts/rehearse-install.sh --sslip

  # Safe dry run with your real domain:
  sudo bash scripts/rehearse-install.sh --domain panel.example.com

  # Go live on this VPS (stops npm dev/agent, starts systemd + Caddy):
  sudo bash scripts/rehearse-install.sh --domain panel.example.com --email you@example.com --cutover
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    --email) CADDY_EMAIL="${2:?}"; shift 2 ;;
    --sslip) USE_SSLIP=1; shift ;;
    --cutover) CUTOVER=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="/etc/reforgerpanel/env"
PANEL_USER="${SUDO_USER:-ubuntu}"
PANEL_PORT=3000
PASS=0
FAIL=0
WARN=0

ok() { echo "  OK   $*"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $*"; FAIL=$((FAIL + 1)); }
warn() { echo "  WARN $*"; WARN=$((WARN + 1)); }

section() {
  echo
  echo "== $* =="
}

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/rehearse-install.sh" >&2
  exit 1
fi

if [[ "${USE_SSLIP}" -eq 1 ]]; then
  ip="$(curl -fsS -4 --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
  DOMAIN="${ip//./-}.sslip.io"
  echo "Using sslip.io test hostname: ${DOMAIN}"
fi

if [[ -z "${DOMAIN}" ]]; then
  echo "Provide --domain or --sslip for DNS/TLS rehearsal." >&2
  usage
  exit 1
fi

if [[ "${CUTOVER}" -eq 1 && -z "${CADDY_EMAIL}" ]]; then
  warn "No --email for ACME; continuing without Caddy admin email"
fi

section "Script syntax"
for f in "${SCRIPT_DIR}"/*.sh; do
  if bash -n "${f}" 2>/dev/null; then
    ok "$(basename "${f}")"
  else
    bad "$(basename "${f}") syntax error"
  fi
done

section "Prerequisites"
for cmd in node npm psql curl openssl; do
  if command -v "${cmd}" >/dev/null 2>&1; then ok "${cmd} installed"; else bad "${cmd} missing"; fi
done
if node -v 2>/dev/null | grep -qE 'v(2[0-9]|[3-9][0-9])'; then ok "Node $(node -v)"; else bad "Node 20+ required"; fi

section "DNS"
if bash "${SCRIPT_DIR}/verify-dns.sh" "${DOMAIN}"; then
  ok "DNS ${DOMAIN} points at this server"
else
  bad "DNS check failed for ${DOMAIN}"
fi

section "Existing services (must not touch game servers)"
if pgrep -u reforger -f ArmaReforgerServer >/dev/null 2>&1; then
  ok "Reforger game instances running ($(pgrep -u reforger -fc ArmaReforgerServer || echo 0) process(es)) — left untouched"
else
  warn "No ArmaReforgerServer processes detected"
fi

if ss -tlnp 2>/dev/null | grep -q ':9100 '; then
  if [[ "${CUTOVER}" -eq 1 ]]; then
    warn "Agent listening on :9100 — will stop for cutover"
  else
    ok "Agent on :9100 (dev) — left running in rehearsal mode"
  fi
else
  warn "Nothing on :9100"
fi

if ss -tlnp 2>/dev/null | grep -q ':3000 '; then
  bind="$(ss -tlnp | grep ':3000 ' | head -1)"
  if [[ "${CUTOVER}" -eq 1 ]]; then
    warn "Panel on :3000 — will stop for cutover (${bind})"
  else
    if echo "${bind}" | grep -q '127.0.0.1'; then ok "Panel on 127.0.0.1:3000"; else warn "Panel on :3000 is public (${bind}) — cutover sets HOSTNAME=127.0.0.1"; fi
  fi
else
  warn "Nothing on :3000"
fi

if ss -tlnp 2>/dev/null | grep -qE ':80 |:443 '; then
  bad "Ports 80/443 already in use — Caddy cannot bind"
else
  ok "Ports 80 and 443 available for Caddy"
fi

section "Environment"
if [[ -f "${ENV_FILE}" ]]; then
  ok "${ENV_FILE} exists"
  # shellcheck disable=SC1090
  set -a && source "${ENV_FILE}" && set +a
  if [[ -n "${DATABASE_URL:-}" ]]; then ok "DATABASE_URL configured"; else bad "DATABASE_URL missing"; fi
  if [[ -n "${SECRETS_ENCRYPTION_KEY:-}" && "${SECRETS_ENCRYPTION_KEY}" != change-me* ]]; then ok "SECRETS_ENCRYPTION_KEY set"; else warn "SECRETS_ENCRYPTION_KEY not set or placeholder"; fi
else
  bad "${ENV_FILE} missing — run bootstrap + setup-postgres first"
fi

section "Caddy config (validate only)"
TMP_CADDY="$(mktemp -d)"
cp "${INSTALL_DIR}/deploy/caddy/Caddyfile.template" "${TMP_CADDY}/Caddyfile"
sed -i "s|@@DOMAIN@@|${DOMAIN}|g; s|@@PANEL_PORT@@|${PANEL_PORT}|g" "${TMP_CADDY}/Caddyfile"

if command -v caddy >/dev/null 2>&1; then
  if caddy validate --config "${TMP_CADDY}/Caddyfile" --adapter caddyfile 2>/dev/null; then
    ok "Caddyfile validates"
  else
    bad "Caddyfile invalid"
  fi
else
  warn "Caddy not installed yet — install-vps.sh / cutover will install it"
fi
rm -rf "${TMP_CADDY}"

section "Systemd unit rendering"
TMP_UNIT="$(mktemp)"
npm_path="$(command -v npm)"
for unit in reforgerpanel-agent reforgerpanel; do
  sed \
    -e "s|/home/ubuntu/reforgerpanel|${INSTALL_DIR}|g" \
    -e "s|^User=ubuntu|User=${PANEL_USER}|g" \
    -e "s|ExecStart=/usr/bin/npm|ExecStart=${npm_path}|g" \
    "${INSTALL_DIR}/deploy/${unit}.service" >"${TMP_UNIT}"
  if grep -q "WorkingDirectory=${INSTALL_DIR}" "${TMP_UNIT}"; then
    ok "${unit}.service renders for ${INSTALL_DIR}"
  else
    bad "${unit}.service render failed"
  fi
done
rm -f "${TMP_UNIT}"

section "Production build"
if [[ "${SKIP_BUILD}" -eq 1 ]]; then
  warn "Skipped build (--skip-build)"
elif [[ "${CUTOVER}" -eq 1 || ! -d "${INSTALL_DIR}/.next" ]]; then
  PANEL_HOME="$(getent passwd "${PANEL_USER}" | cut -d: -f6)"
  if sudo -u "${PANEL_USER}" env HOME="${PANEL_HOME}" bash -lc "cd '${INSTALL_DIR}' && npm run build"; then
    ok "npm run build succeeded"
  else
    bad "npm run build failed"
  fi
else
  if sudo -u "${PANEL_USER}" env HOME="$(getent passwd "${PANEL_USER}" | cut -d: -f6)" bash -lc "cd '${INSTALL_DIR}' && npm run build"; then
    ok "npm run build succeeded"
  else
    bad "npm run build failed"
  fi
fi

section "Database migrate (idempotent)"
PANEL_HOME="$(getent passwd "${PANEL_USER}" | cut -d: -f6)"
chown root:"${PANEL_USER}" "${ENV_FILE}" 2>/dev/null || true
chmod 640 "${ENV_FILE}" 2>/dev/null || true
if sudo -u "${PANEL_USER}" env HOME="${PANEL_HOME}" bash -lc "
  set -a; source '${ENV_FILE}'; set +a
  cd '${INSTALL_DIR}' && npm run db:migrate
"; then
  ok "db:migrate succeeded"
else
  bad "db:migrate failed"
fi

if [[ "${CUTOVER}" -eq 0 ]]; then
  section "Rehearsal complete (no cutover)"
  echo
  echo "Dry run finished. Dev servers were NOT stopped."
  echo "To go live on this VPS:"
  echo "  sudo bash scripts/rehearse-install.sh --domain ${DOMAIN} --email you@example.com --cutover"
  echo
  echo "Fresh VPS (empty machine):"
  echo "  sudo bash scripts/install-vps.sh --domain ${DOMAIN} --email you@example.com"
  echo
  echo "Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings"
  [[ "${FAIL}" -eq 0 ]] || exit 1
  exit 0
fi

section "Cutover to production"
echo "Stopping dev panel/agent on ports 3000 and 9100…"
for port in 3000 9100; do
  pids="$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  for pid in ${pids}; do
    cmd="$(ps -p "${pid}" -o comm= 2>/dev/null || true)"
    if [[ "${cmd}" == *node* || "${cmd}" == *npm* ]]; then
      kill "${pid}" 2>/dev/null || true
      ok "Stopped PID ${pid} on :${port}"
    fi
  done
done
sleep 2

BACKUP="${ENV_FILE}.pre-cutover.$(date +%s)"
cp "${ENV_FILE}" "${BACKUP}"
ok "Backed up env to ${BACKUP}"

bash "${SCRIPT_DIR}/install-vps.sh" \
  --domain "${DOMAIN}" \
  ${CADDY_EMAIL:+--email "${CADDY_EMAIL}"} \
  --existing \
  --skip-game \
  --skip-build \
  --no-ufw

section "Post-cutover verification"
sleep 3
if bash "${SCRIPT_DIR}/check-install.sh"; then
  ok "check-install passed"
else
  bad "check-install failed — see journalctl -u caddy -u reforgerpanel"
fi

echo
echo "Cutover complete: https://${DOMAIN}"
echo "Env backup: ${BACKUP}"
echo "Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings"
[[ "${FAIL}" -eq 0 ]] || exit 1
