#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
UNIT="${2:-}"

if [[ -z "$ACTION" || -z "$UNIT" ]]; then
  echo "usage: reforger-ctl <start|stop|restart|is-active|show> reforger@<slug>.service [systemctl args...]" >&2
  exit 1
fi

case "$ACTION" in
  start | stop | restart | is-active | show) ;;
  *)
    echo "invalid action: $ACTION" >&2
    exit 1
    ;;
esac

if [[ ! "$UNIT" =~ ^reforger@[a-z0-9][a-z0-9-]{0,39}\.service$ ]]; then
  echo "invalid unit: $UNIT" >&2
  exit 1
fi

shift 2
exec /bin/systemctl "$ACTION" "$UNIT" "$@"
