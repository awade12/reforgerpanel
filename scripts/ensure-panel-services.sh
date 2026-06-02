#!/usr/bin/env bash
# Reinstall systemd units from the repo, enable boot autostart, and restart panel stack.
set -euo pipefail

ENV_FILE="/etc/reforgerpanel/env"
INSTALL_DIR="${1:-}"

if [[ -z "${INSTALL_DIR}" ]]; then
  if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a && source "${ENV_FILE}" && set +a
  fi
  INSTALL_DIR="${PANEL_ROOT:-/opt/reforgerpanel}"
fi

if [[ ! -f "${INSTALL_DIR}/deploy/reforgerpanel.service" ]]; then
  echo "Missing ${INSTALL_DIR}/deploy/reforgerpanel.service" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/ensure-panel-services.sh" >&2
  exit 1
fi

PANEL_USER="${SUDO_USER:-ubuntu}"
if ! id "${PANEL_USER}" &>/dev/null; then
  echo "User ${PANEL_USER} does not exist" >&2
  exit 1
fi

npm_path="$(command -v npm)"

for unit in reforgerpanel-agent reforgerpanel reforgerpanel-bot; do
  sed \
    -e "s|/opt/reforgerpanel|${INSTALL_DIR}|g" \
    -e "s|^User=ubuntu|User=${PANEL_USER}|g" \
    -e "s|ExecStart=/usr/bin/npm|ExecStart=${npm_path}|g" \
    "${INSTALL_DIR}/deploy/${unit}.service" >"/etc/systemd/system/${unit}.service"
done

if [[ -f "${INSTALL_DIR}/deploy/reforgerpanel.sudoers" ]]; then
  cp "${INSTALL_DIR}/deploy/reforgerpanel.sudoers" /etc/sudoers.d/reforgerpanel
  chmod 440 /etc/sudoers.d/reforgerpanel
  visudo -cf /etc/sudoers.d/reforgerpanel
fi

if [[ -f "${ENV_FILE}" ]]; then
  grep -q '^PANEL_ROOT=' "${ENV_FILE}" && sed -i "s|^PANEL_ROOT=.*|PANEL_ROOT=${INSTALL_DIR}|" "${ENV_FILE}" || echo "PANEL_ROOT=${INSTALL_DIR}" >>"${ENV_FILE}"
  grep -q '^HOSTNAME=' "${ENV_FILE}" || echo "HOSTNAME=127.0.0.1" >>"${ENV_FILE}"
  grep -q '^PORT=' "${ENV_FILE}" || echo "PORT=3000" >>"${ENV_FILE}"
  chown root:"${PANEL_USER}" "${ENV_FILE}"
  chmod 640 "${ENV_FILE}"
fi

systemctl daemon-reload
systemctl enable caddy reforgerpanel-agent reforgerpanel

if [[ ! -f "${INSTALL_DIR}/.next/BUILD_ID" ]]; then
  echo "WARN: no production build at ${INSTALL_DIR}/.next/BUILD_ID"
  echo "Run: cd ${INSTALL_DIR} && sudo -u ${PANEL_USER} npm run build"
fi

systemctl restart reforgerpanel-agent
sleep 2
systemctl restart reforgerpanel
if systemctl is-enabled reforgerpanel-bot &>/dev/null; then
  systemctl restart reforgerpanel-bot || true
fi
if systemctl list-unit-files caddy.service &>/dev/null; then
  systemctl enable caddy
  systemctl restart caddy
fi

echo
echo "Enabled on boot:"
systemctl is-enabled caddy reforgerpanel-agent reforgerpanel 2>/dev/null || true
echo
echo "Running now:"
systemctl is-active caddy reforgerpanel-agent reforgerpanel 2>/dev/null || true
