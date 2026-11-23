#!/bin/bash
# T-S17-06: la construcción falla si la AMI trae secretos o le falta algo de lo que la aplicación necesita.
set -euo pipefail
fail() { echo "VERIFICACIÓN FALLIDA: $*" >&2; exit 1; }

app=/opt/banco-talentos/current/backend

# Cero secretos: ningún .env real (el único permitido es el enlace a /run, que no existe en la AMI) ni cachés.
found="$(find /opt/banco-talentos /var/lib/banco-talentos /etc -name '.env*' ! -name '.env.example' ! -type l -print)"
[ -z "$found" ] || fail "archivos .env en la imagen: $found"
[ "$(readlink "$app/.env")" = /run/banco-talentos/.env ] || fail ".env no apunta a /run/banco-talentos/.env"
[ ! -e /run/banco-talentos/.env ] || fail "/run/banco-talentos/.env existe durante la construcción"
[ -z "$(find /var/lib/banco-talentos/bootstrap-cache -name '*.php' -print)" ] || fail "cachés de Laravel horneadas"
! grep -rIlq --exclude-dir=vendor -e 'APP_KEY=base64:' /opt/banco-talentos /etc 2>/dev/null \
  || fail "APP_KEY en archivos de la imagen"
[ ! -e /etc/banco-talentos/instance.env ] || fail "instance.env horneado (lo escribe el user_data de Terraform)"

# PHP 8.4 y extensiones.
php -r 'exit(PHP_MAJOR_VERSION === 8 && PHP_MINOR_VERSION === 4 ? 0 : 1);' || fail "PHP no es 8.4"
for ext in pdo_pgsql intl zip pcntl mbstring curl dom xml openssl fileinfo tokenizer ctype bcmath; do
  php -m | grep -qix "$ext" || fail "falta la extensión $ext"
done
php8.4 -d opcache.enable_cli=1 -r 'exit(function_exists("opcache_get_status") ? 0 : 1);' || fail "falta opcache"
php-fpm8.4 -t

# ffmpeg con los códecs de VideoProcessor.
encoders="$(ffmpeg -hide_banner -encoders)"
for codec in libx264 libvpx-vp9 libopus; do
  grep -q " $codec " <<<"$encoders" || fail "ffmpeg sin $codec"
done
command -v ffprobe >/dev/null || fail "falta ffprobe"
command -v nice >/dev/null || fail "falta nice"

# Laravel arranca sin .env (solo comandos que no tocan la base).
php "$app/artisan" --version >/dev/null || fail "artisan no arranca"

# Caddy, systemd, swap y SSM.
DOMAIN=piloto.example.com ACME_EMAIL=ops@example.com S3_ORIGIN=https://bucket.s3.us-east-2.amazonaws.com \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemd-analyze verify /etc/systemd/system/bt-*.service /etc/systemd/system/bt-*.timer
grep -q '^/swapfile none swap' /etc/fstab || fail "swap sin entrada en /etc/fstab"
systemctl is-enabled --quiet amazon-ssm-agent || fail "amazon-ssm-agent no está habilitado"
id -nG caddy | grep -qw www-data || fail "caddy no pertenece a www-data"
aws --version >/dev/null

rm -rf /tmp/bt-files
echo "AMI verificada: $(cat /opt/banco-talentos/RELEASE)"
