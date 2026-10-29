#!/bin/sh
set -eu

if [ "${APP_ENV:-}" != simulation ] || [ "${DB_DATABASE:-}" != banco_talentos_sim ]; then
    echo 'La simulación requiere APP_ENV=simulation y su base banco_talentos_sim.' >&2
    exit 1
fi

# Clave propia y estable: el NSS se guarda cifrado y debe poder descifrarse tras reiniciar. No usa la de desarrollo.
if [ ! -s /sim-state/app_key ]; then
    php -r 'echo "base64:".base64_encode(random_bytes(32));' > /sim-state/app_key
fi
APP_KEY="$(cat /sim-state/app_key)"
export APP_KEY

# Storage y cachés de framework fuera de backend/storage, para no mezclarse con desarrollo.
export LARAVEL_STORAGE_PATH=/sim-state/storage
export APP_CONFIG_CACHE=/sim-state/cache/config.php
export APP_SERVICES_CACHE=/sim-state/cache/services.php
export APP_PACKAGES_CACHE=/sim-state/cache/packages.php
export APP_ROUTES_CACHE=/sim-state/cache/routes.php
export APP_EVENTS_CACHE=/sim-state/cache/events.php
mkdir -p /sim-state/cache "$LARAVEL_STORAGE_PATH/framework/cache/data" "$LARAVEL_STORAGE_PATH/framework/sessions" \
    "$LARAVEL_STORAGE_PATH/framework/views" "$LARAVEL_STORAGE_PATH/logs" "$LARAVEL_STORAGE_PATH/app/private"

if [ "${1:-}" = serve ]; then
    composer install --no-interaction --prefer-dist --no-progress
    php artisan migrate --force --no-interaction
    exec php artisan serve --host=0.0.0.0 --port=8000 --no-reload
fi

exec "$@"
