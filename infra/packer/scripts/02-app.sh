#!/bin/bash
# T-S17-06: instala la versión de la aplicación. El código queda de solo lectura (root); lo que cambia vive en
# /var/lib/banco-talentos (www-data) y la configuración en /run/banco-talentos (tmpfs, escrita por bt-boot).
set -euo pipefail
: "${RELEASE_SHA:?}"

release="/opt/banco-talentos/releases/$RELEASE_SHA"
state=/var/lib/banco-talentos

install -d -m 0755 "$release"
tar -xzf /tmp/release.tar.gz -C "$release"
rm -f /tmp/release.tar.gz

# Nada de estado ni de configuración dentro del código.
rm -rf "$release/backend/storage" "$release/backend/bootstrap/cache" "$release/backend/.env"
ln -s "$state/storage" "$release/backend/storage"
ln -s "$state/bootstrap-cache" "$release/backend/bootstrap/cache"
ln -s /run/banco-talentos/.env "$release/backend/.env"

chown -R root:root "$release"
chmod -R u=rwX,go=rX "$release"
ln -sfn "$release" /opt/banco-talentos/current
echo "$RELEASE_SHA" > /opt/banco-talentos/RELEASE

install -d -m 0750 -o www-data -g www-data "$state" "$state/bootstrap-cache"
install -d -m 0750 -o www-data -g www-data "$state/storage" "$state/storage/app" "$state/storage/app/private" \
  "$state/storage/app/media" "$state/storage/framework" "$state/storage/framework/cache" \
  "$state/storage/framework/cache/data" "$state/storage/framework/sessions" "$state/storage/framework/views" \
  "$state/storage/logs"
