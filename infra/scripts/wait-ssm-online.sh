#!/bin/bash
# T-S17-08: espera a que la instancia aparezca Online en SSM (agente registrado) y a que bt-boot termine.
# Uso: wait-ssm-online.sh <instance-id> [timeout-segundos]
set -euo pipefail

instance_id="${1:?instance-id}"
timeout="${2:-900}"
deadline=$((SECONDS + timeout))

until [ "$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$instance_id" \
  --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null)" = Online ]; do
  [ "$SECONDS" -lt "$deadline" ] || { echo "La instancia $instance_id no apareció en SSM" >&2; exit 1; }
  sleep 10
done
echo "SSM: $instance_id en línea"

script_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC2016 # el script se expande en la instancia, no aquí.
"$script_dir/ssm-run.sh" "$instance_id" 600 \
  'for i in $(seq 1 120); do systemctl is-active --quiet bt-boot && exit 0; systemctl is-failed --quiet bt-boot && { journalctl -u bt-boot --no-pager | tail -50; exit 1; }; sleep 5; done; exit 1'
