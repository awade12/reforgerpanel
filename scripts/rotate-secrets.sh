#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${SECRETS_ENCRYPTION_KEY_OLD:-}" ]]; then
  echo "Set SECRETS_ENCRYPTION_KEY_OLD to the previous key, and SECRETS_ENCRYPTION_KEY to the new key, then re-run."
  exit 1
fi

if [[ -z "${SECRETS_ENCRYPTION_KEY:-}" ]]; then
  echo "SECRETS_ENCRYPTION_KEY is required."
  exit 1
fi

echo "Re-encrypting stored secrets with the new key..."
npx tsx scripts/rotate-secrets.ts
echo "Done. Remove SECRETS_ENCRYPTION_KEY_OLD and restart the agent."
