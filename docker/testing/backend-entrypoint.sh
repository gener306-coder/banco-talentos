#!/bin/sh
set -eu

if [ "${APP_ENV:-}" != testing ] || [ "${DB_DATABASE:-}" != banco_talentos_testing ]; then
    echo 'El entorno de pruebas requiere su base de datos aislada.' >&2
    exit 1
fi

# Clave efímera: no se lee ni modifica APP_KEY del entorno de desarrollo.
APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
export APP_KEY

# Ni las sesiones ni las cachés de pruebas comparten archivos con desarrollo.
test_storage="$(mktemp -d)"
export LARAVEL_STORAGE_PATH="$test_storage/storage"
export APP_CONFIG_CACHE="$test_storage/config.php"
export APP_SERVICES_CACHE="$test_storage/services.php"
export APP_PACKAGES_CACHE="$test_storage/packages.php"
export APP_ROUTES_CACHE="$test_storage/routes.php"
export APP_EVENTS_CACHE="$test_storage/events.php"
mkdir -p "$LARAVEL_STORAGE_PATH/framework/cache/data" \
    "$LARAVEL_STORAGE_PATH/framework/sessions" \
    "$LARAVEL_STORAGE_PATH/framework/views" "$LARAVEL_STORAGE_PATH/logs"
composer install --no-interaction --prefer-dist --no-progress

if [ "${1:-}" = serve-e2e ]; then
    export DB_DATABASE=banco_talentos_e2e_testing
    php artisan migrate --force --no-interaction
    php tests/Fixtures/seed-e2e.php
    exec php artisan serve --host=0.0.0.0 --port=8000 --no-reload
fi

exec "$@"
