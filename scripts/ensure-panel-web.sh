#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/reforgerpanel/env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

PORT="${PORT:-3000}"
PANEL_URL="http://127.0.0.1:${PORT}/login"
TRIES="${1:-30}"
SLEEP="${2:-2}"

panel_responding() {
  curl -fsS --max-time 3 "${PANEL_URL}" >/dev/null 2>&1
}

if ! panel_responding; then
  if systemctl is-active --quiet reforgerpanel 2>/dev/null; then
    echo "reforgerpanel is active but not responding on :${PORT} — restarting…"
    sudo systemctl restart reforgerpanel
  else
    echo "Starting reforgerpanel…"
    sudo systemctl start reforgerpanel 2>/dev/null || sudo systemctl restart reforgerpanel
  fi
fi

for ((i = 1; i <= TRIES; i++)); do
  if panel_responding; then
    echo "Panel web UI OK on ${PANEL_URL}"
    if systemctl is-enabled caddy &>/dev/null 2>&1; then
      sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy
    fi
    exit 0
  fi
  if ! systemctl is-active --quiet reforgerpanel 2>/dev/null; then
    sudo systemctl start reforgerpanel 2>/dev/null || true
  fi
  sleep "${SLEEP}"
done

echo "ERROR: panel not responding on ${PANEL_URL}" >&2
echo "Check: sudo journalctl -u reforgerpanel -n 40" >&2
exit 1
