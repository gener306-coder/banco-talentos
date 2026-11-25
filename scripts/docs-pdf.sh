#!/bin/sh
# T-S20-02 y T-S20-07: genera desde docs/tecnica/ los diagramas (SVG y PNG) y el PDF formal en un contenedor fijado.
# Solo requiere Docker o Podman; las salidas quedan en docs/tecnica/build/ (ignorada por Git).
#   sh scripts/docs-pdf.sh diagramas   valida los bloques Mermaid y exporta build/diagramas/Dxx.svg y Dxx.png
#   sh scripts/docs-pdf.sh pdf         PDF formal en tamaño Carta (T-S20-07)
set -eu
cd "$(dirname "$0")/.."

case "${1:-diagramas}" in
    diagramas) script=diagrams.mjs ;;
    pdf) echo "docs-pdf: el PDF formal se agrega en T-S20-07." >&2; exit 2 ;;
    *) echo "Uso: sh scripts/docs-pdf.sh [diagramas|pdf]" >&2; exit 64 ;;
esac

engine="${CONTAINER_ENGINE:-}"
if [ -z "$engine" ]; then
    if command -v docker >/dev/null 2>&1; then engine=docker
    elif command -v podman >/dev/null 2>&1; then engine=podman
    else echo "docs-pdf: se necesita Docker o Podman." >&2; exit 1
    fi
fi

# Podman sin root necesita conservar el usuario para que los archivos generados sean tuyos.
userns=""
[ "$engine" = podman ] && userns="--userns=keep-id"

image=banco-talentos-docs
"$engine" build --quiet --tag "$image" docs/tecnica/tools >/dev/null

# :z permite el volumen con SELinux (Fedora); en los demás sistemas no tiene efecto.
# shellcheck disable=SC2086
"$engine" run --rm $userns --user "$(id -u):$(id -g)" --env HOME=/tmp \
    --volume "$PWD/docs/tecnica:/docs:z" "$image" "/tools/$script" /docs
