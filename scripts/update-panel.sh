#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STATE_FILE="${PANEL_UPDATE_STATE_FILE:-${INSTALL_DIR}/data/panel-update-state.json}"
DATA_DIR="$(dirname "${STATE_FILE}")"
LOG_FILE="${PANEL_UPDATE_LOG_FILE:-${DATA_DIR}/panel-update.log}"
ENV_FILE="/etc/reforgerpanel/env"
export PANEL_UPDATE_STATE_FILE="${STATE_FILE}"

mkdir -p "${DATA_DIR}"
touch "${LOG_FILE}"
exec >>"${LOG_FILE}" 2>&1

started_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
COMMIT_BEFORE=""
COMMIT_AFTER=""
NEXT_BACKUP_DIR=""
PANEL_WAS_STOPPED=0

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

write_state() {
  local ok="$1"
  local error_msg="${2:-}"
  local commit_after="${3:-}"
  local finished_at
  finished_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  mkdir -p "$(dirname "${STATE_FILE}")"
  PANEL_UPDATE_STARTED_AT="${started_at}" \
  PANEL_UPDATE_COMMIT_BEFORE="${COMMIT_BEFORE}" \
  node -e "
const fs = require('fs');
const path = process.env.PANEL_UPDATE_STATE_FILE;
fs.writeFileSync(path, JSON.stringify({
  running: false,
  ok: process.argv[1] === 'true',
  error: process.argv[2] || null,
  startedAt: process.env.PANEL_UPDATE_STARTED_AT || null,
  finishedAt: process.argv[4],
  commitBefore: process.env.PANEL_UPDATE_COMMIT_BEFORE || '',
  commitAfter: process.argv[3] || '',
}, null, 2));
" "$ok" "$error_msg" "$commit_after" "$finished_at"
}

last_log_error() {
  local line
  line="$(tail -30 "${LOG_FILE}" 2>/dev/null | grep -iE 'error|fatal|failed|denied|not found|CONFLICT|exited' | tail -1 || true)"
  if [[ -n "${line}" ]]; then
    echo "${line}"
  else
    echo "Update failed — see ${LOG_FILE}"
  fi
}

panel_local_url() {
  echo "http://127.0.0.1:${PORT:-3000}/login"
}

panel_responding() {
  curl -fsS --max-time 3 "$(panel_local_url)" >/dev/null 2>&1
}

wait_for_panel() {
  local tries="${1:-45}"
  local sleep_sec="${2:-2}"
  for ((i = 1; i <= tries; i++)); do
    if panel_responding; then
      echo "Panel web UI responding on $(panel_local_url)"
      return 0
    fi
    if ! systemctl is-active --quiet reforgerpanel 2>/dev/null; then
      echo "reforgerpanel not active — starting (attempt ${i}/${tries})…"
      sudo -n systemctl start reforgerpanel 2>/dev/null || sudo -n systemctl restart reforgerpanel
    fi
    sleep "${sleep_sec}"
  done
  echo "ERROR: panel not responding on $(panel_local_url)"
  return 1
}

reload_caddy() {
  if ! systemctl is-enabled caddy &>/dev/null 2>&1; then
    return 0
  fi
  echo "Reloading Caddy…"
  sudo -n systemctl reload caddy 2>/dev/null || sudo -n systemctl restart caddy
}

start_panel_if_built() {
  if [[ ! -f "${INSTALL_DIR}/.next/BUILD_ID" ]]; then
    return 1
  fi
  if panel_responding; then
    return 0
  fi
  echo "Starting panel web UI…"
  sudo -n systemctl start reforgerpanel 2>/dev/null || sudo -n systemctl restart reforgerpanel
  wait_for_panel 30 2 || return 1
  reload_caddy || true
}

restart_panel_stack() {
  echo "Restarting panel web UI…"
  sudo -n systemctl restart reforgerpanel
  wait_for_panel 45 2
  reload_caddy
  echo "Restarting panel agent…"
  sudo -n systemctl restart reforgerpanel-agent
  wait_for_panel 30 2
  reload_caddy
  if systemctl is-enabled reforgerpanel-bot &>/dev/null 2>&1; then
    sudo -n systemctl restart reforgerpanel-bot || true
  fi
}

on_exit() {
  local code=$?
  if [[ -f "${INSTALL_DIR}/.next/BUILD_ID" ]] && ! panel_responding; then
    echo "Ensuring panel web UI is up before exit (code ${code})…"
    start_panel_if_built 2>/dev/null || true
    reload_caddy 2>/dev/null || true
  fi
}
trap on_exit EXIT

on_err() {
  if [[ -n "${NEXT_BACKUP_DIR:-}" && -d "${NEXT_BACKUP_DIR}" ]]; then
    echo "Restoring previous production build…"
    rm -rf "${INSTALL_DIR}/.next"
    mv "${NEXT_BACKUP_DIR}" "${INSTALL_DIR}/.next"
  fi
  start_panel_if_built 2>/dev/null || true
  write_state false "$(last_log_error)" "${COMMIT_AFTER:-}"
}
trap on_err ERR

preflight() {
  echo "=== Pre-flight checks ==="
  echo "Install dir: ${INSTALL_DIR}"
  echo "User: $(whoami)"
  echo "NODE_ENV (before ci): ${NODE_ENV:-unset}"

  if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
    echo "ERROR: not a git repository"
    return 1
  fi

  if ! sudo -n systemctl show reforgerpanel &>/dev/null; then
    echo "ERROR: passwordless sudo for systemctl is not configured."
    echo "Fix: sudo cp ${INSTALL_DIR}/deploy/reforgerpanel.sudoers /etc/sudoers.d/reforgerpanel"
    echo "     sudo visudo -cf /etc/sudoers.d/reforgerpanel"
    write_state false "sudo systemctl not allowed — update /etc/sudoers.d/reforgerpanel" ""
    exit 1
  fi

  if ! command -v npm node git &>/dev/null; then
    echo "ERROR: npm, node, or git not in PATH"
    return 1
  fi

  echo "Pre-flight OK"
}

cd "${INSTALL_DIR}"
COMMIT_BEFORE="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "=== Panel update started at ${started_at} ==="
echo "Commit before: ${COMMIT_BEFORE}"

preflight

git fetch origin
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${branch}" == "HEAD" ]]; then
  branch="main"
fi

git fetch origin "${branch}"
echo "Syncing to origin/${branch}…"
git reset --hard "origin/${branch}"

COMMIT_AFTER="$(git rev-parse --short HEAD)"
echo "Commit after: ${COMMIT_AFTER}"

if [[ "${COMMIT_BEFORE}" == "${COMMIT_AFTER}" ]]; then
  echo "Already up to date — skipping build"
  write_state true "" "${COMMIT_AFTER}"
  start_panel_if_built || echo "WARN: panel not running and no build — run npm run build"
  exit 0
fi

if [[ -f "${INSTALL_DIR}/.next/BUILD_ID" ]]; then
  NEXT_BACKUP_DIR="${INSTALL_DIR}/.next.backup.$$"
  rm -rf "${NEXT_BACKUP_DIR}"
  cp -a "${INSTALL_DIR}/.next" "${NEXT_BACKUP_DIR}"
  echo "Backed up existing .next build"
fi

echo "Stopping panel web UI during build (agent stays up)…"
sudo -n systemctl stop reforgerpanel 2>/dev/null || true
PANEL_WAS_STOPPED=1

echo "Running npm ci (includes devDependencies for build)…"
NODE_ENV=development npm ci

echo "Running npm run build (may take several minutes)…"
NODE_ENV=production npm run build

echo "Running db migrate…"
npm run db:migrate || echo "db:migrate skipped or failed (non-fatal)"

if [[ ! -f "${INSTALL_DIR}/.next/BUILD_ID" ]]; then
  echo "ERROR: No production build (.next/BUILD_ID missing)"
  if [[ -n "${NEXT_BACKUP_DIR:-}" && -d "${NEXT_BACKUP_DIR}" ]]; then
    echo "Restoring previous production build…"
    rm -rf "${INSTALL_DIR}/.next"
    mv "${NEXT_BACKUP_DIR}" "${INSTALL_DIR}/.next"
  fi
  start_panel_if_built 2>/dev/null || true
  write_state false "Build incomplete — see ${LOG_FILE}" "${COMMIT_AFTER}"
  exit 1
fi

rm -rf "${NEXT_BACKUP_DIR:-}"
NEXT_BACKUP_DIR=""

echo "Restarting panel services…"
restart_panel_stack
write_state true "" "${COMMIT_AFTER}"

echo "=== Panel update finished OK ==="
