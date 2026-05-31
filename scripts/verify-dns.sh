#!/usr/bin/env bash
# Verify DNS for the panel hostname before requesting Let's Encrypt certs.
set -euo pipefail

DOMAIN="${1:?usage: $0 DOMAIN}"
STRICT="${STRICT_DNS:-1}"

if ! command -v dig >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y dnsutils
fi

server_ip="$(curl -fsS -4 --max-time 5 ifconfig.me 2>/dev/null || true)"
if [[ -z "${server_ip}" ]]; then
  server_ip="$(hostname -I | awk '{print $1}')"
fi

if [[ -z "${server_ip}" ]]; then
  echo "Could not determine this server's public IP." >&2
  exit 1
fi

mapfile -t resolved < <(dig +short A "${DOMAIN}" | grep -E '^[0-9.]+$' || true)

if [[ ${#resolved[@]} -eq 0 ]]; then
  echo "DNS check failed: ${DOMAIN} has no A record." >&2
  echo "Create an A record pointing ${DOMAIN} -> ${server_ip} and wait for propagation." >&2
  exit 1
fi

match=0
for ip in "${resolved[@]}"; do
  if [[ "${ip}" == "${server_ip}" ]]; then
    match=1
    break
  fi
done

if [[ "${match}" -eq 0 ]]; then
  echo "DNS check failed: ${DOMAIN} resolves to ${resolved[*]}, but this server is ${server_ip}." >&2
  if [[ "${STRICT}" == "1" ]]; then
    echo "Let's Encrypt HTTP-01 requires the domain to reach this machine on ports 80 and 443." >&2
    exit 1
  fi
  echo "Continuing anyway (STRICT_DNS=0)."
fi

echo "DNS OK: ${DOMAIN} -> ${resolved[*]} (server ${server_ip})"
