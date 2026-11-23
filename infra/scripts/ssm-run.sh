#!/bin/bash
# T-S17-08: ejecuta un script en una instancia por SSM Run Command, espera el resultado e imprime la salida.
# Uso: ssm-run.sh <instance-id> <timeout-segundos> <comandos...>
set -euo pipefail

instance_id="${1:?instance-id}"
timeout="${2:?timeout}"
shift 2
commands="$(printf '%s\n' "$@")"

command_id="$(aws ssm send-command \
  --instance-ids "$instance_id" \
  --document-name AWS-RunShellScript \
  --timeout-seconds 600 \
  --parameters "$(jq -n --arg c "$commands" --arg t "$timeout" '{commands: [$c], executionTimeout: [$t]}')" \
  --query Command.CommandId --output text)"
echo "SSM: comando $command_id en $instance_id"

deadline=$((SECONDS + timeout + 120))
status=Pending
while [ "$SECONDS" -lt "$deadline" ]; do
  sleep 5
  status="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" \
    --query Status --output text 2>/dev/null || echo Pending)"
  case "$status" in
    Pending | InProgress | Delayed) continue ;;
    *) break ;;
  esac
done

aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text || true
echo "SSM: estado $status"
[ "$status" = Success ]
