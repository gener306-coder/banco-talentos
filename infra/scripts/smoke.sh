#!/bin/bash
# T-S17-08: smoke del piloto por HTTPS (auditoría QA sección 3 #2). Reintenta mientras Caddy obtiene el certificado.
# Uso: smoke.sh https://piloto.example.com
set -euo pipefail

url="${1:?url}"
url="${url%/}"
host="${url#https://}"
fail() { echo "SMOKE FALLIDO: $*" >&2; exit 1; }

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 10 -o /dev/null "$url/up"; then
    break
  fi
  [ "$attempt" -lt 30 ] || fail "$url/up no respondió 200 (¿registro A en Hostinger? ¿certificado?)"
  echo "Esperando $url/up (intento $attempt/30)"
  sleep 20
done
echo "OK  /up responde 200 con un certificado válido"

spa="$(curl -fsS --max-time 10 -D - -o /dev/null "$url/")"
header() { grep -i "^$1:" <<<"$spa" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }
[ "$(header strict-transport-security)" = "max-age=31536000; includeSubDomains" ] || fail "HSTS"
[[ "$(header content-security-policy)" == *"script-src 'self';"* ]] || fail "CSP sin script-src 'self'"
[[ "$(header content-security-policy)" == *"frame-ancestors 'none'"* ]] || fail "CSP sin frame-ancestors"
[ "$(header x-content-type-options)" = nosniff ] || fail "X-Content-Type-Options"
[ "$(header referrer-policy)" = no-referrer ] || fail "Referrer-Policy"
[ -z "$(header server)" ] || fail "la cabecera Server revela el servidor"
echo "OK  la SPA envía HSTS, CSP, nosniff y no-referrer"

api="$(curl -sS --max-time 10 -D - -o /dev/null -H 'Accept: application/json' "$url/api/me")"
grep -q '^HTTP/[0-9.]* 401' <<<"$api" || fail "/api/me sin sesión no respondió 401"
grep -qi '^cache-control:.*no-store' <<<"$api" || fail "/api/me sin Cache-Control no-store"
echo "OK  /api/me responde 401 con no-store"

redirect="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code} %{redirect_url}' "http://$host/")"
[[ "$redirect" =~ ^30[178]\ https:// ]] || fail "HTTP no redirige a HTTPS ($redirect)"
echo "OK  HTTP redirige a HTTPS"
echo "Smoke del piloto superado: $url"
