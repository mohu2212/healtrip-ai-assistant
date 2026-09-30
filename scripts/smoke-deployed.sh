#!/usr/bin/env bash
# Smoke test for a deployed environment.
#   scripts/smoke-deployed.sh https://healtrip-api.onrender.com/api https://healtrip-ai-assistant.vercel.app
set -euo pipefail
API="${1:?API base URL, e.g. https://…onrender.com/api}"
WEB="${2:?Web origin, e.g. https://…vercel.app}"
pass() { printf '  ✓ %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1"; exit 1; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);console.log(eval(process.argv[1]))})" "$1"; }

echo "API $API"
[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 90 "$API/health")" = 200 ] && pass "liveness" || fail "liveness"
[ "$(curl -s "$API/health/ready" | json 'b.checks.database')" = up ] && pass "readiness (database up)" || fail "readiness"
[ "$(curl -s "$API/specialties" | json 'b.meta.count')" -ge 1 ] && pass "catalog seeded" || fail "catalog"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/doctors?specialty=dentistry")" = 400 ] && pass "unknown specialty rejected" || fail "validation"
curl -s -D - -o /dev/null -X OPTIONS "$API/conversations" -H "Origin: $WEB" -H 'Access-Control-Request-Method: POST' \
  | grep -qi "access-control-allow-origin: $WEB" && pass "CORS allows the web origin" || fail "CORS (set CORS_ORIGINS=$WEB)"
curl -s -D - -o /dev/null "$API/health" | grep -qi 'x-content-type-options: nosniff' && pass "security headers" || fail "helmet headers"

ID=$(curl -s -X POST "$API/conversations" -H 'content-type: application/json' -d '{"locale":"en"}' | json 'b.data.id')
REPLY=$(curl -s --max-time 120 -X POST "$API/conversations/$ID/messages" -H 'content-type: application/json' \
  -d '{"text":"Chest pain since this morning and it is spreading to my left arm"}')
[ "$(echo "$REPLY" | json 'b.data.assistantMessage.reply.nextStep')" = ER_NOW ] && pass "emergency scenario → ER_NOW" || fail "chat turn: $REPLY"
echo "    answered by: $(echo "$REPLY" | json 'b.data.assistantMessage.meta.model')"

echo "WEB $WEB"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/en")" = 200 ] && pass "/en" || fail "/en"
curl -s "$WEB/ar" | grep -q 'dir="rtl"' && pass "/ar is right-to-left" || fail "/ar"
echo "All smoke checks passed."
