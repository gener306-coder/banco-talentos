#!/bin/sh
set -eu

if [ "$#" -ge 3 ] && [ "$1" = "npm" ] && [ "$2" = "run" ] && [ "$3" = "dev" ]; then
    npm ci --no-audit --no-fund
fi

exec "$@"
