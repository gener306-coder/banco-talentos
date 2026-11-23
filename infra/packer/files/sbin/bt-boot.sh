#!/bin/bash
# T-S17-06: arranque de cada instancia (docs/infra/pilot-aws-plan.md, §2).
#   1. Lee /banco-talentos/<entorno>/* de SSM Parameter Store y escribe el .env en /run (tmpfs): nunca en disco
#      persistente ni en la AMI.
#   2. Restaura los certificados de Caddy desde S3 (no crítico).
#   3. Genera las cachés de Laravel.
#   4. A3: si hay migraciones pendientes, o la base está vacía (primer despliegue), entra en mantenimiento sin
#      fallar; deploy-pilot.yml migra y ejecuta `artisan up`.
# Solo falla (y con ello no arrancan PHP-FPM, Caddy ni los workers) si no puede obtener una configuración válida.
set -euo pipefail

log() { echo "bt-boot: $*"; }
warn() { echo "bt-boot: AVISO: $*" >&2; }

instance_env=/etc/banco-talentos/instance.env
app=/opt/banco-talentos/current/backend
run_dir=/run/banco-talentos

# El user_data de Terraform (cloud-init) escribe instance.env: BT_ENV, BT_SSM_PATH, AWS_REGION y ACME_EMAIL.
for _ in $(seq 1 60); do
  [ -s "$instance_env" ] && break
  sleep 2
done
[ -s "$instance_env" ] || { echo "bt-boot: falta $instance_env (user_data)" >&2; exit 1; }
# shellcheck source=/dev/null
. "$instance_env"
: "${BT_SSM_PATH:?}" "${AWS_REGION:?}" "${ACME_EMAIL:?}"

artisan() { runuser -u www-data -- /usr/bin/php "$app/artisan" --no-interaction "$@"; }

# 1. Configuración desde SSM ------------------------------------------------------------------------------------
install -d -m 0750 -o root -g www-data "$run_dir"
params=""
for attempt in $(seq 1 10); do
  if params="$(aws ssm get-parameters-by-path --region "$AWS_REGION" --path "$BT_SSM_PATH/" --with-decryption \
    --query 'Parameters[].[Name,Value]' --output json)"; then
    break
  fi
  warn "SSM no respondió (intento $attempt/10)"
  sleep 6
done
[ -n "$params" ] || { echo "bt-boot: no se pudo leer $BT_SSM_PATH de SSM" >&2; exit 1; }

param() { jq -r --arg key "$1" '.[] | select(.[0] | split("/") | last == $key) | .[1]' <<<"$params"; }

for required in APP_KEY APP_URL DB_HOST DB_PASSWORD AWS_BUCKET AWS_DEFAULT_REGION MAIL_PASSWORD; do
  [ -n "$(param "$required")" ] || { echo "bt-boot: falta el parámetro $required en $BT_SSM_PATH" >&2; exit 1; }
done

# Valores entre comillas simples: phpdotenv los toma literales (sin interpolar ${...}). Se rechazan comillas simples y
# saltos de línea, que romperían el formato; los nombres deben ser variables válidas. jq separa con NUL para no alterar
# ningún carácter del valor.
env_tmp="$(mktemp -p "$run_dir" .env.XXXXXX)"
jq -j '.[] | (.[0] | split("/") | last), "\u0000", .[1], "\u0000"' <<<"$params" |
  while IFS= read -r -d '' key && IFS= read -r -d '' value; do
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "bt-boot: nombre de parámetro inválido: $key" >&2; exit 1; }
    [[ "$value" != *"'"* && "$value" != *$'\n'* ]] || { echo "bt-boot: $key contiene comillas simples o saltos de línea" >&2; exit 1; }
    printf "%s='%s'\n" "$key" "$value"
  done >"$env_tmp"
chown root:www-data "$env_tmp"
chmod 0640 "$env_tmp"
mv -f "$env_tmp" "$run_dir/.env"
log "configuración cargada de $BT_SSM_PATH ($(wc -l <"$run_dir/.env") variables)"

app_url="$(param APP_URL)"
domain="${app_url#https://}"
domain="${domain%%/*}"
bucket="$(param AWS_BUCKET)"
s3_region="$(param AWS_DEFAULT_REGION)"
# El SDK firma con el punto global (us-east-1) o el regional: la CSP admite ambos orígenes del bucket.
s3_origin="https://${bucket}.s3.amazonaws.com https://${bucket}.s3.${s3_region}.amazonaws.com"
install -m 0640 -o root -g caddy /dev/stdin "$run_dir/caddy.env" <<CADDY
DOMAIN=$domain
ACME_EMAIL=$ACME_EMAIL
S3_ORIGIN=$s3_origin
BT_BUCKET=$bucket
CADDY

# 2. Estado local y certificados ----------------------------------------------------------------------------------
state=/var/lib/banco-talentos
for dir in "$state/bootstrap-cache" "$state/storage/app/private" "$state/storage/app/media" \
  "$state/storage/framework/cache/data" "$state/storage/framework/sessions" "$state/storage/framework/views" \
  "$state/storage/logs"; do
  install -d -m 0750 -o www-data -g www-data "$dir"
done

if /usr/local/sbin/bt-caddy-certs.sh restore; then
  log "certificados de Caddy restaurados desde S3"
else
  warn "no se restauraron los certificados; Caddy los emitirá de nuevo"
fi
# A3: aunque falle la restauración, todo /var/lib/caddy debe pertenecer a caddy.
chown -R caddy:caddy /var/lib/caddy

# 3. Cachés de Laravel (código inmutable) -----------------------------------------------------------------------
artisan optimize:clear >/dev/null
artisan package:discover >/dev/null
artisan config:cache
artisan route:cache
artisan view:cache
artisan event:cache

# 4. Migraciones (A3) ---------------------------------------------------------------------------------------------
# `migrate:status --pending=1` sale con 1 si hay pendientes; también falla si la tabla migrations no existe (base
# vacía del primer despliegue) o la base no responde. En todos esos casos: mantenimiento, sin abortar el arranque.
if artisan migrate:status --pending=1 >/dev/null 2>&1; then
  log "esquema al día"
else
  warn "migraciones pendientes o base sin inicializar: modo mantenimiento hasta que deploy-pilot.yml migre"
  artisan down --retry=30 || warn "no se pudo activar el modo mantenimiento"
fi

log "listo: versión $(cat /opt/banco-talentos/RELEASE 2>/dev/null || echo desconocida)"
