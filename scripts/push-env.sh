#!/usr/bin/env bash
# Push filled vars from .env.local to Vercel (production + preview) without printing any value.
# Usage: scripts/push-env.sh [NAME ...]   (no names = every filled var)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "no .env.local"; exit 1; }

want=("$@")
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z0-9_]+)=(.*)$ ]] || continue
  name="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  [ "$name" = "VERCEL_OIDC_TOKEN" ] && continue
  [ -z "$val" ] && { echo "skip  $name (empty)"; continue; }
  if [ ${#want[@]} -gt 0 ] && [[ ! " ${want[*]} " =~ " $name " ]]; then continue; fi
  for target in production preview; do
    if printf '%s' "$val" | npx vercel env add "$name" "$target" --force >/dev/null 2>&1; then
      echo "set   $name ($target)"
    else
      echo "FAIL  $name ($target)"
    fi
  done
done < .env.local
