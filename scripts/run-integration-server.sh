#!/usr/bin/env bash
# Start local HTTP MCP server for Phase 1 manual testing (loads .env if present).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export MCP_TRANSPORT="${MCP_TRANSPORT:-http}"
export PORT="${PORT:-8080}"
export MEMORY_STORE="${MEMORY_STORE:-file}"
export MCP_AUTH_TOKEN="${MCP_AUTH_TOKEN:-dev-local-token}"

if [[ -z "${QWEN_API_KEY:-}" ]]; then
  echo "Warning: QWEN_API_KEY not set; server will use fake intelligence." >&2
fi

npm run build
echo "Starting HTTP server on :${PORT} (Bearer ${MCP_AUTH_TOKEN})"
echo "Health: curl -s http://127.0.0.1:${PORT}/health | jq ."
exec npm start
