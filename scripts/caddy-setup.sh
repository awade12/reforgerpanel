#!/usr/bin/env bash
# Install / refresh Caddy reverse proxy for the panel (HTTPS via Let's Encrypt).
set -euo pipefail

DOMAIN="${1:?usage: $0 DOMAIN [PANEL_PORT]}"
PANEL_PORT="${2:-3000}"
SRC_TEMPLATE="${3:-}"
TEMPLATE="${SRC_TEMPLATE:-/etc/reforgerpanel/caddy/Caddyfile.template}"
OUT="/etc/caddy/Caddyfile"

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "Missing ${TEMPLATE}" >&2
  exit 1
fi

mkdir -p "$(dirname "${OUT}")"
sed \
  -e "s|@@DOMAIN@@|${DOMAIN}|g" \
  -e "s|@@PANEL_PORT@@|${PANEL_PORT}|g" \
  "${TEMPLATE}" >"${OUT}"

if [[ -n "${CADDY_ADMIN_EMAIL:-}" ]]; then
  cat >"${OUT}.tmp" <<EOF
{
	email ${CADDY_ADMIN_EMAIL}
}

EOF
  cat "${OUT}" >>"${OUT}.tmp"
  mv "${OUT}.tmp" "${OUT}"
fi

caddy validate --config "${OUT}" --adapter caddyfile
systemctl enable caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "Caddy configured for https://${DOMAIN} -> 127.0.0.1:${PANEL_PORT}"
