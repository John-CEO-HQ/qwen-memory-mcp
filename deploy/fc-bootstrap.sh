#!/bin/bash
# FC custom.debian10 bootstrap: use bundled Node binary and start HTTP server.
set -euo pipefail
cd "$(dirname "$0")"
export NODE_PATH="${NODE_PATH:-/code/node_modules}"
exec ./node dist/index.js
