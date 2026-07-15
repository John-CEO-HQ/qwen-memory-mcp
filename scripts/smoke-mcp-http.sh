#!/usr/bin/env bash
# Manual smoke test for deployed Qwen Memory MCP (Phase 2 / judges).
# Usage:
#   export BASE_URL=https://memory.example.com
#   export MCP_AUTH_TOKEN=your-token
#   ./scripts/smoke-mcp-http.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-}"
TOKEN="${MCP_AUTH_TOKEN:-}"
USER_ID="${INTEGRATION_TEST_USER_ID:-smoke-test-user}"

if [[ -z "$BASE_URL" || -z "$TOKEN" ]]; then
  echo "Set BASE_URL and MCP_AUTH_TOKEN" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
UNIQUE="smoke-$(date +%s)"
AUTH="Authorization: Bearer ${TOKEN}"
JSON='content-type: application/json'
ACCEPT='accept: application/json, text/event-stream'

mcp_jq() {
  node "$ROOT/scripts/parse-mcp-response.mjs" | jq .
}

echo "== health =="
curl -sf "${BASE_URL}/health" | jq .

echo "== tools/list =="
curl -sf "${BASE_URL}/mcp" \
  -H "$JSON" -H "$ACCEPT" -H "$AUTH" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | mcp_jq

echo "== memory_write =="
curl -sf "${BASE_URL}/mcp" \
  -H "$JSON" -H "$ACCEPT" -H "$AUTH" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"memory_write\",\"arguments\":{\"userId\":\"${USER_ID}\",\"content\":\"${UNIQUE}: prefers async standups on Mondays.\"}}}" | mcp_jq

echo "== memory_search =="
curl -sf "${BASE_URL}/mcp" \
  -H "$JSON" -H "$ACCEPT" -H "$AUTH" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"memory_search\",\"arguments\":{\"userId\":\"${USER_ID}\",\"query\":\"standup schedule\",\"k\":5}}}" | mcp_jq

echo "== memory_recall_context =="
curl -sf "${BASE_URL}/mcp" \
  -H "$JSON" -H "$ACCEPT" -H "$AUTH" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"memory_recall_context\",\"arguments\":{\"userId\":\"${USER_ID}\",\"query\":\"meeting preferences\",\"tokenBudget\":256}}}" | mcp_jq

echo "== memory_forget =="
curl -sf "${BASE_URL}/mcp" \
  -H "$JSON" -H "$ACCEPT" -H "$AUTH" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"memory_forget\",\"arguments\":{\"userId\":\"${USER_ID}\"}}}" | mcp_jq

echo "smoke complete (unique marker: ${UNIQUE})"
