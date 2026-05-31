#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/fix-steamcmd.sh"
  exit 1
fi

PANEL_USER="${SUDO_USER:-ubuntu}"
PANEL_HOME="$(getent passwd "${PANEL_USER}" | cut -d: -f6)"
STEAMCMD_DIR="/opt/reforger/steamcmd"
STEAMCMD_BIN="${STEAMCMD_DIR}/steamcmd.sh"
STEAM_HOME="/opt/reforger/steam-home"
ENV_FILE="/etc/reforgerpanel/env"
DOCKER_IMAGE="${STEAM_DOCKER_IMAGE:-cm2network/steamcmd}"

native_test() {
  timeout 120 sudo -u "${PANEL_USER}" env \
    HOME="${STEAM_HOME}" \
    SDL_VIDEODRIVER=dummy \
    bash "${STEAMCMD_BIN}" +quit 2>&1
}

echo "[fix-steamcmd] DNS (systemd-resolved fix for Steam HTTP errors)…"
if [[ -L /etc/resolv.conf ]] && grep -q "127.0.0.53" /etc/resolv.conf 2>/dev/null; then
  ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
fi

echo "[fix-steamcmd] Installing 32-bit libraries…"
dpkg --add-architecture i386 2>/dev/null || true
apt-get update
apt-get install -y \
  lib32gcc-s1 libc6-i386 lib32stdc++6 libstdc++6:i386 \
  lib32z1 libncurses6:i386 libtinfo6:i386 libbz2-1.0:i386 \
  libcurl4t64:i386 libgcc-s1:i386 libnss3:i386

echo "[fix-steamcmd] Fixing permissions…"
mkdir -p /opt/reforger/{server-stable,server-exp,steam-home,steamcmd}
chown -R reforger:reforger "${STEAMCMD_DIR}"
chown "${PANEL_USER}:reforger" /opt/reforger/server-stable /opt/reforger/server-exp "${STEAM_HOME}"
chmod 775 /opt/reforger/server-stable /opt/reforger/server-exp "${STEAM_HOME}"
usermod -aG reforger "${PANEL_USER}" 2>/dev/null || true

echo "[fix-steamcmd] Clearing Steam cache…"
rm -rf "${STEAM_HOME:?}"/* "${PANEL_HOME}/.steam" "${PANEL_HOME}/.local/share/Steam" 2>/dev/null || true
mkdir -p "${STEAM_HOME}"
chown -R "${PANEL_USER}:reforger" "${STEAM_HOME}"

echo "[fix-steamcmd] Re-installing SteamCMD from Valve…"
rm -rf "${STEAMCMD_DIR:?}"/*
curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf - -C "${STEAMCMD_DIR}"
chmod 755 "${STEAMCMD_BIN}" "${STEAMCMD_DIR}/linux32/steamcmd"

cat >/usr/local/bin/steamcmd <<'EOF'
#!/usr/bin/env bash
cd /opt/reforger/steamcmd
exec ./steamcmd.sh "$@"
EOF
chmod 755 /usr/local/bin/steamcmd

grep -q '^STEAMCMD_PATH=' "${ENV_FILE}" 2>/dev/null && \
  sed -i 's|^STEAMCMD_PATH=.*|STEAMCMD_PATH=/opt/reforger/steamcmd/steamcmd.sh|' "${ENV_FILE}" || true
grep -q '^STEAM_HOME=' "${ENV_FILE}" 2>/dev/null && \
  sed -i "s|^STEAM_HOME=.*|STEAM_HOME=${STEAM_HOME}|" "${ENV_FILE}" || echo "STEAM_HOME=${STEAM_HOME}" >>"${ENV_FILE}"

echo "[fix-steamcmd] Testing native SteamCMD…"
set +e
OUTPUT="$(native_test)"
CODE=$?
set -e
echo "${OUTPUT}"

if [[ ${CODE} -eq 0 ]]; then
  sed -i '/^STEAM_USE_DOCKER=/d' "${ENV_FILE}" 2>/dev/null || true
  echo ""
  echo "Native SteamCMD OK."
  echo "  sudo systemctl restart reforgerpanel-agent"
  exit 0
fi

echo ""
echo "[fix-steamcmd] Native SteamCMD failed (exit ${CODE}). Enabling Docker fallback…"
apt-get install -y docker.io
systemctl enable --now docker

grep -q 'NOPASSWD: /usr/bin/docker' /etc/sudoers.d/reforgerpanel 2>/dev/null || \
  echo "${PANEL_USER} ALL=(root) NOPASSWD: /usr/bin/docker" >>/etc/sudoers.d/reforgerpanel
visudo -cf /etc/sudoers.d/reforgerpanel

docker pull "${DOCKER_IMAGE}"

if grep -q '^STEAM_USE_DOCKER=' "${ENV_FILE}" 2>/dev/null; then
  sed -i 's|^STEAM_USE_DOCKER=.*|STEAM_USE_DOCKER=true|' "${ENV_FILE}"
else
  echo "STEAM_USE_DOCKER=true" >>"${ENV_FILE}"
fi
grep -q '^STEAM_DOCKER_IMAGE=' "${ENV_FILE}" 2>/dev/null || echo "STEAM_DOCKER_IMAGE=${DOCKER_IMAGE}" >>"${ENV_FILE}"

echo "[fix-steamcmd] Testing Docker SteamCMD…"
docker run --rm "${DOCKER_IMAGE}" steamcmd +quit

echo ""
echo "Docker SteamCMD OK. Game Install in the panel will use Docker."
echo "  sudo systemctl restart reforgerpanel-agent"
echo "Then: https://panel.example.com/game → Install / update stable"
