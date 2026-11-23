#!/bin/bash
# A1: user_data de la instancia temporal de Packer. Instala el amazon-ssm-agent oficial (Debian no lo trae) para que
# Packer pueda conectarse por Session Manager. La arquitectura se detecta en la propia instancia.
set -euo pipefail

arch="$(dpkg --print-architecture)" # arm64 | amd64
case "$arch" in
  arm64 | amd64) ;;
  *) echo "Arquitectura no soportada: $arch" >&2; exit 1 ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q curl ca-certificates
fi

# Región por IMDSv2 para descargar del bucket regional; si falla, el bucket global.
token="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 300' || true)"
region="$(curl -fsS -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/placement/region || true)"

deb=/tmp/amazon-ssm-agent.deb
if [ -n "$region" ] && curl -fsSL --retry 5 -o "$deb" "https://s3.${region}.amazonaws.com/amazon-ssm-${region}/latest/debian_${arch}/amazon-ssm-agent.deb"; then
  :
else
  curl -fsSL --retry 5 -o "$deb" "https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/debian_${arch}/amazon-ssm-agent.deb"
fi

dpkg -i "$deb"
rm -f "$deb"
systemctl enable amazon-ssm-agent
systemctl restart amazon-ssm-agent
