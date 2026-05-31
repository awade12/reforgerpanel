#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/bootstrap-host.sh"
  exit 1
fi

apt-get update
apt-get install -y libcurl4 curl jq net-tools build-essential lib32gcc-s1

STEAMCMD_DIR="/opt/reforger/steamcmd"
STEAMCMD_BIN="${STEAMCMD_DIR}/steamcmd.sh"

install_steamcmd() {
  mkdir -p "${STEAMCMD_DIR}"
  if [[ ! -f "${STEAMCMD_BIN}" ]]; then
    echo "Installing SteamCMD from Valve..."
    curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf - -C "${STEAMCMD_DIR}"
  fi
  chmod 755 "${STEAMCMD_BIN}" "${STEAMCMD_DIR}/linux32/steamcmd" 2>/dev/null || true
  cat >/usr/local/bin/steamcmd <<'EOF'
#!/usr/bin/env bash
cd /opt/reforger/steamcmd
exec ./steamcmd.sh "$@"
EOF
  chmod 755 /usr/local/bin/steamcmd
}

install_steamcmd

id reforger &>/dev/null || useradd --system --home /opt/reforger --shell /usr/sbin/nologin reforger || true

mkdir -p /opt/reforger/{server-stable,server-exp,instances,missions,local-mods,steamcmd,panel-data,steam-home}
mkdir -p /etc/reforgerpanel

if [[ ! -f /etc/reforgerpanel/env ]]; then
  AGENT_TOKEN="$(openssl rand -hex 32)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  SECRETS_KEY="$(openssl rand -hex 32)"
  cat >/etc/reforgerpanel/env <<EOF
ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20)
AGENT_TOKEN=${AGENT_TOKEN}
SESSION_SECRET=${SESSION_SECRET}
SECRETS_ENCRYPTION_KEY=${SECRETS_KEY}
AGENT_URL=http://127.0.0.1:9100
AGENT_HOST=127.0.0.1
AGENT_PORT=9100
REFORGER_ROOT=/opt/reforger
REFORGER_USER=${SUDO_USER:-ubuntu}
STEAMCMD_PATH=/opt/reforger/steamcmd/steamcmd.sh
PANEL_DATA_DIR=/opt/reforger/panel-data
PORT=3000
HOSTNAME=0.0.0.0
EOF
  chmod 600 /etc/reforgerpanel/env
  chown root:"${SUDO_USER:-ubuntu}" /etc/reforgerpanel/env
  chmod 640 /etc/reforgerpanel/env
  echo "Created /etc/reforgerpanel/env with generated secrets."
fi

chown -R reforger:reforger /opt/reforger/steamcmd /opt/reforger/server-stable /opt/reforger/server-exp
chown -R "${SUDO_USER:-ubuntu}:reforger" /opt/reforger/instances /opt/reforger/missions /opt/reforger/local-mods /opt/reforger/panel-data /opt/reforger/steam-home 2>/dev/null || chown -R ubuntu:reforger /opt/reforger/instances /opt/reforger/missions /opt/reforger/local-mods /opt/reforger/panel-data /opt/reforger/steam-home
chmod 775 /opt/reforger/server-stable /opt/reforger/server-exp
chmod -R g+rwX /opt/reforger/instances /opt/reforger/missions /opt/reforger/local-mods /opt/reforger/panel-data
usermod -aG reforger "${SUDO_USER:-ubuntu}" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cp "${PROJECT_ROOT}/deploy/reforger@.service" /etc/systemd/system/reforger@.service
chmod 644 /etc/systemd/system/reforger@.service
install -m 755 "${PROJECT_ROOT}/deploy/reforger-ctl.sh" /usr/local/bin/reforger-ctl
cp "${PROJECT_ROOT}/deploy/reforgerpanel.sudoers" /etc/sudoers.d/reforgerpanel
chmod 440 /etc/sudoers.d/reforgerpanel
visudo -cf /etc/sudoers.d/reforgerpanel
systemctl daemon-reload

cat >/opt/reforger/steamcmd/update_stable.txt <<'EOF'
@ShutdownOnFailedCommand 1
@NoPromptForPassword 1
force_install_dir /opt/reforger/server-stable
login anonymous
app_update 1874900 validate
quit
EOF

cat >/opt/reforger/steamcmd/update_exp.txt <<'EOF'
@ShutdownOnFailedCommand 1
@NoPromptForPassword 1
force_install_dir /opt/reforger/server-exp
login anonymous
app_update 1890870 validate
quit
EOF

echo "Bootstrap complete."
echo "Install stable server: steamcmd +runscript /opt/reforger/steamcmd/update_stable.txt"
echo "Start panel agent: cd /home/ubuntu/reforgerpanel && npm run agent"
echo "Start web UI: npm run dev (or npm run build && npm run start)"
