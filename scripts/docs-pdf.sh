#!/bin/sh
# T-S20-02 y T-S20-07: genera desde docs/tecnica/ los diagramas (SVG y PNG) y el PDF formal en un contenedor fijado.
# Solo requiere Docker o Podman; las salidas quedan en docs/tecnica/build/ (ignorada por Git).
#   sh scripts/docs-pdf.sh             PDF formal en tamaño Carta (incluye la exportación de los diagramas)
#   sh scripts/docs-pdf.sh pdf         lo mismo
#   sh scripts/docs-pdf.sh diagramas   solo valida los bloques Mermaid y exporta build/diagramas/Dxx.svg y Dxx.png
set -eu
cd "$(dirname "$0")/.."

case "${1:-pdf}" in
    pdf) script=build.mjs ;;
    diagramas) script=diagrams.mjs ;;
    *) echo "Uso: sh scripts/docs-pdf.sh [pdf|diagramas]" >&2; exit 64 ;;
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

# Datos de la portada: commit, rama y fecha del último commit (sin ellos, el PDF lo indica).
commit="$(git rev-parse --short HEAD 2>/dev/null || echo sin-commit)"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo desconocida)"
date="$(git log -1 --format=%cs 2>/dev/null || date +%F)"
if [ -n "$(git status --porcelain -- docs/tecnica 2>/dev/null)" ]; then commit="$commit+cambios"; fi

image=banco-talentos-docs
"$engine" build --quiet --tag "$image" docs/tecnica/tools >/dev/null

# :z permite los volúmenes con SELinux (Fedora); en los demás sistemas no tiene efecto. Los logotipos oficiales se
# leen de frontend/public/brand (solo lectura), sin copiarlos a docs/tecnica.
# shellcheck disable=SC2086
"$engine" run --rm $userns --user "$(id -u):$(id -g)" --env HOME=/tmp \
    --env DOCS_COMMIT="$commit" --env DOCS_BRANCH="$branch" --env DOCS_DATE="$date" \
    --volume "$PWD/docs/tecnica:/docs:z" --volume "$PWD/frontend/public/brand:/brand:ro,z" \
    "$image" "/tools/$script" /docs /brand
