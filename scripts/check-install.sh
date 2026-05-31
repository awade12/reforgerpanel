#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/reforgerpanel/env"
FAIL=0

ok() { echo "  OK  $*"; }
bad() { echo "  FAIL $*"; FAIL=1; }
warn() { echo "  WARN $*"; }

echo "Reforger Panel — post-install check"
echo

for svc in caddy reforgerpanel-agent reforgerpanel; do
  if systemctl is-active --quiet "${svc}"; then
    ok "${svc} is running"
  else
    bad "${svc} is not running (systemctl status ${svc})"
  fi
done

if [[ -f "${ENV_FILE}" ]]; then
  ok "env file ${ENV_FILE}"
  # shellcheck disable=SC1090
  set -a && source "${ENV_FILE}" && set +a
else
  bad "missing ${ENV_FILE}"
fi

if [[ "${HOSTNAME:-}" == "127.0.0.1" ]]; then
  ok "panel bound to localhost (${HOSTNAME})"
else
  warn "HOSTNAME=${HOSTNAME:-unset} — production should use HOSTNAME=127.0.0.1 behind Caddy"
fi

if [[ "${COOKIE_SECURE:-}" == "true" ]]; then
  ok "secure session cookies enabled"
else
  bad "COOKIE_SECURE is not true"
fi

if curl -fsS --max-time 3 "http://127.0.0.1:${AGENT_PORT:-9100}/health" >/dev/null 2>&1; then
  ok "agent /health"
else
  bad "agent not responding on 127.0.0.1:${AGENT_PORT:-9100}"
fi

if curl -fsS --max-time 5 "http://127.0.0.1:${PORT:-3000}/login" >/dev/null 2>&1; then
  ok "panel web UI on 127.0.0.1:${PORT:-3000}"
else
  bad "panel not responding on 127.0.0.1:${PORT:-3000}"
fi

if [[ -n "${PANEL_PUBLIC_URL:-}" ]]; then
  domain="${PANEL_PUBLIC_URL#https://}"
  domain="${domain#http://}"
  domain="${domain%%/*}"
  if curl -fsS --max-time 10 "https://${domain}/login" >/dev/null 2>&1; then
    ok "public HTTPS https://${domain}/login"
  else
    bad "HTTPS not reachable at https://${domain}/login (journalctl -u caddy)"
  fi
else
  bad "PANEL_PUBLIC_URL not set"
fi

if command -v caddy >/dev/null 2>&1; then
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    ok "Caddyfile valid"
  else
    bad "Caddyfile invalid"
  fi
else
  bad "caddy not installed"
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  if command -v psql >/dev/null 2>&1; then
    if psql "${DATABASE_URL}" -c 'SELECT 1' >/dev/null 2>&1; then
      ok "PostgreSQL connection"
    else
      bad "PostgreSQL connection failed"
    fi
  else
    ok "DATABASE_URL set (psql not installed for live check)"
  fi
else
  bad "DATABASE_URL not set — run sudo bash scripts/setup-postgres.sh"
fi

if command -v steamcmd >/dev/null 2>&1; then
  ok "steamcmd installed"
else
  bad "steamcmd missing"
fi

if [[ -d /opt/reforger/server-stable/ArmaReforgerServer ]]; then
  ok "game server binaries present"
else
  warn "game server not installed yet — use Game Install in panel or steamcmd"
fi

echo
if [[ "${FAIL}" -eq 0 ]]; then
  echo "All critical checks passed."
  exit 0
fi
echo "Some checks failed — see messages above."
exit 1
