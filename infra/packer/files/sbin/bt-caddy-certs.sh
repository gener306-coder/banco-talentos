#!/bin/bash
# T-S17-06: respalda (backup) o restaura (restore) los datos de Caddy (certificados y cuenta ACME) en
# s3://<bucket>/caddy/. El bucket es privado y cifrado; solo el rol de la instancia puede leerlo.
set -euo pipefail

# shellcheck source=/dev/null
. /etc/banco-talentos/instance.env
# shellcheck source=/dev/null
. /run/banco-talentos/caddy.env

data=/var/lib/caddy/.local/share/caddy
remote="s3://${BT_BUCKET:?}/caddy/"

case "${1:-}" in
  backup)
    [ -d "$data" ] || exit 0
    aws s3 sync "$data" "$remote" --region "$AWS_REGION" --delete --sse AES256 --only-show-errors
    ;;
  restore)
    install -d -o caddy -g caddy "$data"
    aws s3 sync "$remote" "$data" --region "$AWS_REGION" --only-show-errors
    # A3: los archivos restaurados deben ser de caddy, o no podrá renovarlos.
    chown -R caddy:caddy /var/lib/caddy
    find "$data" -type f -exec chmod 0600 {} +
    ;;
  *)
    echo "Uso: $0 backup|restore" >&2
    exit 2
    ;;
esac
