#!/bin/sh
set -eu

if [ "$#" -ge 3 ] && [ "$1" = "php" ] && [ "$2" = "artisan" ] && [ "$3" = "serve" ]; then
    if [ ! -f .env ]; then
        cp .env.example .env
    fi

    composer install --no-interaction --prefer-dist

    if grep -q '^APP_KEY=$' .env; then
        php artisan key:generate --no-interaction
    fi
fi

exec "$@"
