#!/bin/bash
# T-S17-06: paquetes del sistema, swap y configuración de servicios. Corre como root dentro de Packer.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
FILES=/tmp/bt-files

apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade

# PHP 8.4 y ffmpeg (libx264, libvpx-vp9, libopus) vienen de Debian 13, sin repositorios de terceros. En Debian, pcntl
# está compilado en php8.4-cli (lo usa el worker para cortar trabajos que rebasan su límite).
apt-get install -y -q --no-install-recommends \
  php8.4-fpm php8.4-cli php8.4-opcache php8.4-pgsql php8.4-intl php8.4-zip php8.4-mbstring php8.4-xml \
  php8.4-curl php8.4-bcmath \
  ffmpeg jq unzip curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https \
  postgresql-client unattended-upgrades

# AWS CLI v2 (instalador oficial): lee SSM Parameter Store y sincroniza los certificados de Caddy.
case "$(dpkg --print-architecture)" in
  arm64) cli_arch=aarch64 ;;
  amd64) cli_arch=x86_64 ;;
esac
curl -fsSL --retry 5 -o /tmp/awscliv2.zip "https://awscli.amazonaws.com/awscli-exe-linux-${cli_arch}.zip"
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install --update
rm -rf /tmp/aws /tmp/awscliv2.zip

# Caddy desde su repositorio oficial (HTTPS automático con Let's Encrypt y respaldo ZeroSSL).
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -q
apt-get install -y -q caddy

# A3: Caddy habla con PHP-FPM por su socket (www-data, 0660).
usermod -aG www-data caddy

# A2: swap de 2 GB para que ffmpeg (VP9) no sufra OOM en los 2 GB de la t4g.small. Persistente en /etc/fstab.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
install -m 0644 /dev/stdin /etc/sysctl.d/90-banco-talentos.conf <<'SYSCTL'
# A2: el swap solo amortigua picos (ffmpeg); la memoria física sigue siendo la preferida.
vm.swappiness = 10
SYSCTL

# PHP: los mismos límites que docker/backend/php.ini, más opcache para código inmutable.
install -m 0644 "$FILES/php/zz-banco-talentos.ini" /etc/php/8.4/fpm/conf.d/zz-banco-talentos.ini
install -m 0644 "$FILES/php/zz-banco-talentos.ini" /etc/php/8.4/cli/conf.d/zz-banco-talentos.ini
install -m 0644 "$FILES/php/www.conf" /etc/php/8.4/fpm/pool.d/www.conf

# Caddy, scripts y unidades systemd.
install -m 0644 "$FILES/caddy/Caddyfile" /etc/caddy/Caddyfile
install -m 0755 "$FILES/sbin/bt-boot.sh" /usr/local/sbin/bt-boot.sh
install -m 0755 "$FILES/sbin/bt-caddy-certs.sh" /usr/local/sbin/bt-caddy-certs.sh
install -m 0755 "$FILES/sbin/bt-artisan" /usr/local/bin/bt-artisan
for unit in "$FILES"/systemd/*.service "$FILES"/systemd/*.timer; do
  install -m 0644 "$unit" /etc/systemd/system/
done
for service in php8.4-fpm caddy; do
  install -d /etc/systemd/system/$service.service.d
  install -m 0644 "$FILES/systemd/$service.override.conf" /etc/systemd/system/$service.service.d/banco-talentos.conf
done

# journald acotado: los logs de Laravel (stderr), Caddy y los workers viven aquí.
install -d /etc/systemd/journald.conf.d
install -m 0644 /dev/stdin /etc/systemd/journald.conf.d/banco-talentos.conf <<'JOURNALD'
[Journal]
SystemMaxUse=500M
JOURNALD

# Solo parches de seguridad automáticos (configuración por defecto de Debian).
echo 'unattended-upgrades unattended-upgrades/enable_auto_updates boolean true' | debconf-set-selections
dpkg-reconfigure -f noninteractive unattended-upgrades

systemctl daemon-reload
# Los servicios arrancan en cada instancia nueva, después de bt-boot (que obtiene la configuración de SSM).
systemctl stop caddy php8.4-fpm || true
systemctl enable amazon-ssm-agent bt-boot.service php8.4-fpm.service caddy.service \
  bt-queue@videos.service bt-queue@default.service bt-schedule.timer bt-caddy-certs.timer

apt-get clean
rm -rf /var/lib/apt/lists/*
