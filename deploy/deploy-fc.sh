#!/usr/bin/env bash
# Build code bundle and deploy Function Compute (custom runtime, no ACR).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION="${ALIBABA_REGION:-ap-southeast-1}"
VPC_ID="${VPC_ID:-vpc-t4n6jlv8kbw6q7xbk5oib}"
VSWITCH_ID="${VSWITCH_ID:-vsw-t4n19kvckmepuuq0cyxym}"
SG_NAME="${FC_SECURITY_GROUP_NAME:-qwen-memory-fc-sg}"
CODE_DIR="$DEPLOY_DIR/.fc-code"
RESOLVED_YAML="$DEPLOY_DIR/s.resolved.yaml"

cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -f "$ROOT/.env.rds.generated" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/.env.rds.generated"
  set +a
fi

if [[ -z "${ALIBABA_CLOUD_ACCESS_KEY_ID:-}" || -z "${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-}" ]]; then
  echo "deploy-fc: missing Alibaba RAM credentials in .env" >&2
  exit 1
fi

export ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET
export ALIBABA_REGION="$REGION"

echo "deploy-fc: building TypeScript ..."
npm run build

echo "deploy-fc: staging FC code bundle ..."
rm -rf "$CODE_DIR"
mkdir -p "$CODE_DIR"
cp package.json "$CODE_DIR/"
cp -r dist "$CODE_DIR/dist"
cp "$DEPLOY_DIR/fc-bootstrap.sh" "$CODE_DIR/bootstrap"
chmod +x "$CODE_DIR/bootstrap"
NODE_VERSION="${FC_NODE_VERSION:-22.12.0}"
NODE_TARBALL="node-v${NODE_VERSION}-linux-x64"
if [[ ! -x "$CODE_DIR/node" ]]; then
  echo "deploy-fc: downloading Node ${NODE_VERSION} linux-x64 for FC bundle ..."
  TMP_NODE="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}.tar.xz" -o "$TMP_NODE/node.tar.xz"
  tar -xJf "$TMP_NODE/node.tar.xz" -C "$TMP_NODE"
  cp "$TMP_NODE/${NODE_TARBALL}/bin/node" "$CODE_DIR/node"
  chmod +x "$CODE_DIR/node"
  rm -rf "$TMP_NODE"
fi
npm install --omit=dev --prefix "$CODE_DIR"

echo "deploy-fc: ensuring FC security group ..."
SG_JSON="$(node "$DEPLOY_DIR/aliyun-infra-api.mjs" ensure-security-group \
  --vpc "$VPC_ID" --name "$SG_NAME" --region "$REGION")"
SG_ID="$(echo "$SG_JSON" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(j.securityGroupId||'');")"
echo "deploy-fc: security group $SG_ID"

FC_MYSQL_HOST="${MYSQL_HOST_PRIVATE:-rm-gs56bv9zf5g03q9td.mysql.singapore.rds.aliyuncs.com}"

echo "deploy-fc: ensuring FC VPC execution role ..."
ROLE_JSON="$(node "$DEPLOY_DIR/aliyun-infra-api.mjs" ensure-fc-vpc-role)"
ROLE_ARN="$(echo "$ROLE_JSON" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(j.roleArn||'');")"
echo "deploy-fc: role $ROLE_ARN"

node "$DEPLOY_DIR/render-s-yaml.mjs" \
  --mode custom-runtime \
  --code-dir "$CODE_DIR" \
  --out "$RESOLVED_YAML" \
  --region "$REGION" \
  --role-arn "$ROLE_ARN" \
  --vpc "$VPC_ID" \
  --vswitch "$VSWITCH_ID" \
  --sg "$SG_ID" \
  --mysql-host "$FC_MYSQL_HOST" \
  --mysql-user "$MYSQL_USER" \
  --mysql-password "$MYSQL_PASSWORD" \
  --mysql-database "$MYSQL_DATABASE" \
  --qwen-key "$QWEN_API_KEY" \
  --qwen-base "$QWEN_BASE_URL" \
  --qwen-chat "${QWEN_CHAT_MODEL:-qwen-plus}" \
  --qwen-embed "${QWEN_EMBEDDING_MODEL:-text-embedding-v3}" \
  --mcp-token "$MCP_AUTH_TOKEN"

echo "deploy-fc: configuring Serverless Devs access ..."
node "$DEPLOY_DIR/aliyun-infra-api.mjs" write-s-access --region "$REGION"

echo "deploy-fc: deploying with Serverless Devs (fc3 custom runtime) ..."
cd "$DEPLOY_DIR"
npx @serverless-devs/s deploy -y -a default -t s.resolved.yaml

echo "deploy-fc: HTTP trigger URL ..."
cd "$DEPLOY_DIR"
URL_LINE="$(npx @serverless-devs/s info -a default -t s.resolved.yaml 2>/dev/null | grep 'system_url:' | head -1 | awk '{print $2}')"
if [[ -n "$URL_LINE" ]]; then
  FC_URL="$URL_LINE"
  URL_JSON="$(node -e "console.log(JSON.stringify({url: process.argv[1]}))" "$FC_URL")"
else
  URL_JSON="$(node "$DEPLOY_DIR/aliyun-infra-api.mjs" print-fc-url --function qwen-memory-mcp --region "$REGION")"
  FC_URL="$(echo "$URL_JSON" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(j.url||'');")"
fi
echo "$URL_JSON"
if [[ -n "$FC_URL" ]]; then
  INTEGRATION_FILE="$ROOT/.env.integration"
  if [[ ! -f "$INTEGRATION_FILE" ]]; then
    cp "$ROOT/.env.integration.example" "$INTEGRATION_FILE"
  fi
  if grep -q '^DEPLOYED_MCP_URL=' "$INTEGRATION_FILE"; then
    sed -i "s|^DEPLOYED_MCP_URL=.*|DEPLOYED_MCP_URL=$FC_URL|" "$INTEGRATION_FILE"
  else
    echo "DEPLOYED_MCP_URL=$FC_URL" >> "$INTEGRATION_FILE"
  fi
  echo "deploy-fc: wrote DEPLOYED_MCP_URL to $INTEGRATION_FILE"
fi

echo "deploy-fc: done."
