#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STATE_FILE="${PANEL_UPDATE_STATE_FILE:-${INSTALL_DIR}/data/panel-update-state.json}"
DATA_DIR="$(dirname "${STATE_FILE}")"
LOG_FILE="${PANEL_UPDATE_LOG_FILE:-${DATA_DIR}/panel-update.log}"

mkdir -p "${DATA_DIR}"
touch "${LOG_FILE}"
exec >>"${LOG_FILE}" 2>&1

started_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

write_state() {
  local ok="$1"
  local error="${2:-}"
  local commit_after="${3:-}"
  local finished_at
  finished_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  mkdir -p "$(dirname "${STATE_FILE}")"
  cat >"${STATE_FILE}" <<EOF
{"running":false,"ok":${ok},"error":"${error}","startedAt":"${started_at}","finishedAt":"${finished_at}","commitBefore":"${COMMIT_BEFORE:-}","commitAfter":"${commit_after}"}
EOF
}

on_err() {
  if [[ -n "${NEXT_BACKUP_DIR:-}" && -d "${NEXT_BACKUP_DIR}" ]]; then
    echo "Restoring previous production build…"
    rm -rf "${INSTALL_DIR}/.next"
    mv "${NEXT_BACKUP_DIR}" "${INSTALL_DIR}/.next"
  fi
  sudo systemctl start reforgerpanel 2>/dev/null || start_panel_if_built || true
  write_state false "Update failed — see ${LOG_FILE}" "${COMMIT_AFTER:-}"
}
trap on_err ERR

start_panel_if_built() {
  if [[ ! -f "${INSTALL_DIR}/.next/BUILD_ID" ]]; then
    return 1
  fi
  if systemctl is-active --quiet reforgerpanel 2>/dev/null; then
    return 0
  fi
  echo "Starting panel web UI…"
  sudo systemctl start reforgerpanel
}

cd "${INSTALL_DIR}"
COMMIT_BEFORE="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "=== Panel update started at ${started_at} ==="
echo "Install dir: ${INSTALL_DIR}"
echo "Commit before: ${COMMIT_BEFORE}"

git fetch origin
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${branch}" == "HEAD" ]]; then
  branch="main"
fi
git pull --ff-only origin "${branch}"

COMMIT_AFTER="$(git rev-parse --short HEAD)"
echo "Commit after: ${COMMIT_AFTER}"

if [[ "${COMMIT_BEFORE}" == "${COMMIT_AFTER}" ]]; then
  echo "Already up to date — skipping build"
  write_state true "" "${COMMIT_AFTER}"
  start_panel_if_built || echo "WARN: panel not running and no build present — run npm run build"
  exit 0
fi

NEXT_BACKUP_DIR=""
if [[ -f "${INSTALL_DIR}/.next/BUILD_ID" ]]; then
  NEXT_BACKUP_DIR="${INSTALL_DIR}/.next.backup.$$"
  rm -rf "${NEXT_BACKUP_DIR}"
  cp -a "${INSTALL_DIR}/.next" "${NEXT_BACKUP_DIR}"
  echo "Backed up existing .next build"
fi

echo "Stopping panel web UI during build (agent stays up)…"
sudo systemctl stop reforgerpanel 2>/dev/null || true

echo "Running npm ci (may take several minutes)…"
npm ci
echo "Running npm run build (may take several minutes)…"
npm run build
echo "Running db migrate…"
npm run db:migrate || echo "db:migrate skipped or failed (non-fatal)"

if [[ ! -f "${INSTALL_DIR}/.next/BUILD_ID" ]]; then
  echo "ERROR: No production build (.next/BUILD_ID missing) — not restarting services"
  write_state false "Build incomplete — run npm run build and restart manually" "${COMMIT_AFTER}"
  exit 1
fi

rm -rf "${NEXT_BACKUP_DIR:-}"
NEXT_BACKUP_DIR=""

echo "Restarting panel services…"
write_state true "" "${COMMIT_AFTER}"

sudo systemctl restart reforgerpanel-agent reforgerpanel
if systemctl is-enabled reforgerpanel-bot &>/dev/null; then
  sudo systemctl restart reforgerpanel-bot || true
fi

echo "=== Panel update finished OK ==="
