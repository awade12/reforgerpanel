#!/usr/bin/env bash
# Wait for Caddy to obtain a certificate and serve the panel over HTTPS.
set -euo pipefail

DOMAIN="${1:?usage: $0 DOMAIN}"
TRIES="${2:-36}"
SLEEP="${3:-5}"

echo "Waiting for https://${DOMAIN} (up to $((TRIES * SLEEP))s)…"

for ((i = 1; i <= TRIES; i++)); do
  if curl -fsS --max-time 10 "https://${DOMAIN}/login" >/dev/null 2>&1; then
    echo "HTTPS OK: https://${DOMAIN}/login"
    exit 0
  fi
  if systemctl is-active --quiet caddy; then
    echo "  attempt ${i}/${TRIES}: not ready yet (Caddy running, retrying)…"
  else
    echo "  attempt ${i}/${TRIES}: caddy is not active — check journalctl -u caddy" >&2
  fi
  sleep "${SLEEP}"
done

echo "HTTPS check timed out for https://${DOMAIN}" >&2
echo "Common fixes:" >&2
echo "  - Confirm DNS A record points at this VPS" >&2
echo "  - Open ports 80 and 443 (ufw + cloud firewall)" >&2
echo "  - journalctl -u caddy -n 50" >&2
exit 1
