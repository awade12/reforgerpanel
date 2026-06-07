#!/usr/bin/env bash
set -euo pipefail

target="${1:?usage: reforger-rm-path PATH}"
ROOT="${REFORGER_INSTANCES_ROOT:-/opt/reforger/instances}"

if [[ ! -e "$target" ]]; then
  exit 0
fi

resolved="$(readlink -f "$target" 2>/dev/null || realpath "$target")"
case "$resolved" in
  "${ROOT}"/*) ;;
  *)
    echo "refusing to remove path outside ${ROOT}: ${resolved}" >&2
    exit 1
    ;;
esac

rm -rf "$resolved"
