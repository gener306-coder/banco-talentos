#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

# Credenciales efímeras de las cuentas de prueba; nunca se imprimen ni versionan.
E2E_PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
E2E_EMAIL="hu-s1-01-$(date +%s)@example.test"
E2E_ADMIN_PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
E2E_ADMIN_EMAIL="hu-s1-02-admin-$(date +%s)@example.test"
export E2E_EMAIL E2E_PASSWORD E2E_ADMIN_EMAIL E2E_ADMIN_PASSWORD

cleanup() {
    docker compose -p banco-talentos-tests -f compose.testing.yaml down --remove-orphans
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker compose -p banco-talentos-tests -f compose.testing.yaml up \
    --build --abort-on-container-exit --exit-code-from e2e e2e
