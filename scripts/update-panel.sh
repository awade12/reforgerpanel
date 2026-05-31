#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STATE_FILE="${PANEL_UPDATE_STATE_FILE:-${INSTALL_DIR}/data/panel-update-state.json}"
LOG_FILE="${PANEL_UPDATE_LOG_FILE:-/var/log/reforgerpanel-update.log}"

mkdir -p "$(dirname "${STATE_FILE}")"
touch "${LOG_FILE}" 2>/dev/null || LOG_FILE="${INSTALL_DIR}/data/panel-update.log"
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
  write_state false "Update failed — see ${LOG_FILE}" "${COMMIT_AFTER:-}"
}
trap on_err ERR

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
  exit 0
fi

npm ci
npm run build
npm run db:migrate || echo "db:migrate skipped or failed (non-fatal)"

echo "Restarting panel services…"
sudo systemctl restart reforgerpanel-agent reforgerpanel
if systemctl is-enabled reforgerpanel-bot &>/dev/null; then
  sudo systemctl restart reforgerpanel-bot || true
fi

write_state true "" "${COMMIT_AFTER}"
echo "=== Panel update finished OK ==="
