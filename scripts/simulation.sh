#!/bin/sh
# Simulación de carga con datos aleatorios en un entorno aislado (proyecto Compose banco-talentos-sim).
# Nunca toca los proyectos banco-talentos (desarrollo) ni banco-talentos-tests (pruebas).
set -eu
cd "$(dirname "$0")/.."

compose() {
    docker compose -p banco-talentos-sim -f compose.simulation.yaml "$@"
}

# Los comandos artisan pasan por el entrypoint para usar la clave y el storage de la simulación.
artisan() {
    compose exec -T backend sh /sim-entrypoint.sh php -d memory_limit=1G artisan "$@"
}

command="${1:-}"
[ "$#" -gt 0 ] && shift

case "$command" in
    up)
        compose up -d --build --wait backend frontend
        echo "Simulación lista: frontend http://localhost:${SIM_FRONTEND_PORT:-5180} · API http://localhost:${SIM_BACKEND_PORT:-8100}"
        ;;
    seed)
        artisan simulation:seed "$@"
        ;;
    benchmark)
        artisan simulation:benchmark "$@"
        ;;
    explain)
        artisan simulation:explain "$@"
        ;;
    down)
        if [ "${1:-}" = --purge ]; then
            compose down --remove-orphans --volumes
            echo 'Simulación eliminada, incluidos sus datos.'
        else
            compose down --remove-orphans
            echo 'Simulación detenida; sus datos se conservan (usa down --purge para borrarlos).'
        fi
        ;;
    *)
        echo 'Uso: sh scripts/simulation.sh up | seed [opciones] | benchmark --password=... | explain | down [--purge]' >&2
        exit 2
        ;;
esac
