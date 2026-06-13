#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${WORLD_CUP_SERVICE:-world-cup.service}"
HEALTH_URL="${WORLD_CUP_HEALTH_URL:-http://127.0.0.1:3008/world-cup/api/health}"

old_started_at="$(
  curl -fsS "$HEALTH_URL" 2>/dev/null \
    | node -e "let data=''; process.stdin.on('data', chunk => data += chunk); process.stdin.on('end', () => { try { process.stdout.write(JSON.parse(data).startedAt || '') } catch {} })" \
    || true
)"

npm test
systemctl restart "$SERVICE_NAME"

for attempt in {1..20}; do
  health="$(curl -fsS "$HEALTH_URL" 2>/dev/null || true)"
  if [[ -n "$health" ]]; then
    result="$(
      printf '%s' "$health" \
        | node -e "let data=''; process.stdin.on('data', chunk => data += chunk); process.stdin.on('end', () => { const health = JSON.parse(data); process.stdout.write([health.ok, health.consistency?.ok, health.startedAt || '', health.pid || ''].join('\\t')) })"
    )"
    IFS=$'\t' read -r healthy consistent started_at pid <<< "$result"
    if [[ "$healthy" == "true" && "$consistent" == "true" && "$started_at" != "$old_started_at" ]]; then
      printf 'Deployment verified: pid=%s startedAt=%s\n' "$pid" "$started_at"
      exit 0
    fi
  fi
  sleep 0.5
done

printf 'Deployment verification failed for %s\n' "$HEALTH_URL" >&2
exit 1
