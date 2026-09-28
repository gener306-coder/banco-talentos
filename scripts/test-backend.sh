#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

cleanup() {
    docker compose -p banco-talentos-tests -f compose.testing.yaml down --remove-orphans
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker compose -p banco-talentos-tests -f compose.testing.yaml run --build --rm backend composer test "$@"
