#!/bin/sh
# Boot wrapper for Activepieces on Railway.
#
# Order matters: the administrator is created while the app is listening only on
# an internal port that the Railway edge does not route, so the first request
# ever served on the public domain already meets a claimed instance.
set -eu

cd /usr/src/app

if [ -z "${AP_ADMIN_EMAIL:-}" ]; then
    echo "[railway] FATAL: AP_ADMIN_EMAIL is empty. Set it before deploying." >&2
    exit 1
fi
if [ -z "${AP_ADMIN_PASSWORD:-}" ]; then
    echo "[railway] FATAL: AP_ADMIN_PASSWORD is empty. Set it before deploying." >&2
    exit 1
fi
if [ "$(printf %s "$AP_ADMIN_PASSWORD" | wc -c)" -lt 8 ]; then
    echo "[railway] FATAL: AP_ADMIN_PASSWORD must be at least 8 characters." >&2
    exit 1
fi

# Activepieces refuses to boot without a public URL. Derive it from the Railway
# domain so the deploy form does not have to ask for something Railway knows.
if [ -z "${AP_FRONTEND_URL:-}" ] && [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
    export AP_FRONTEND_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
fi
if [ -z "${AP_FRONTEND_URL:-}" ]; then
    echo "[railway] FATAL: AP_FRONTEND_URL is empty and no Railway domain was found." >&2
    exit 1
fi

# Railway injects PORT; the stock entrypoint reads AP_PORT and defaults to 80.
export AP_PORT="${PORT:-80}"
SEED_PORT="${AP_SEED_PORT:-13000}"

node /usr/local/bin/ap-admin.cjs wait-db

STATE="$(node /usr/local/bin/ap-admin.cjs state)"
echo "[railway] administrator state: ${STATE}"

if [ "$STATE" = "seeded" ]; then
    node /usr/local/bin/ap-admin.cjs rotate
    echo "[railway] starting Activepieces on port ${AP_PORT}"
    exec ./docker-entrypoint.sh
fi

echo "[railway] seeding the administrator on internal port ${SEED_PORT} before the public port opens"
AP_PORT="$SEED_PORT" AP_CONTAINER_TYPE=APP ./docker-entrypoint.sh &
SEED_PID=$!

if ! node /usr/local/bin/ap-admin.cjs seed "http://127.0.0.1:${SEED_PORT}"; then
    kill "$SEED_PID" 2>/dev/null || true
    pm2 kill >/dev/null 2>&1 || true
    echo "[railway] FATAL: could not seed the administrator; refusing to open the public port." >&2
    exit 1
fi

kill "$SEED_PID" 2>/dev/null || true
pm2 kill >/dev/null 2>&1 || true
wait "$SEED_PID" 2>/dev/null || true

node /usr/local/bin/ap-admin.cjs assert-seeded

echo "[railway] starting Activepieces on port ${AP_PORT}"
exec ./docker-entrypoint.sh
