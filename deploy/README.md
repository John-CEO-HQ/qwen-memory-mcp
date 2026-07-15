# Deploying Qwen Memory MCP on Alibaba Cloud

For full local install and step-by-step production setup, see
[docs/INSTALL.md](../docs/INSTALL.md).

This server is designed to run its backend on Alibaba Cloud and call Qwen via
Alibaba Cloud Model Studio (DashScope).

Hackathon proof files:

- [`src/qwen.ts`](../src/qwen.ts) - DashScope (Qwen embeddings + chat).
- [`src/memory/mysql-store.ts`](../src/memory/mysql-store.ts) - RDS / PolarDB MySQL.

## Quick deploy (RDS + Function Compute)

Region: **ap-southeast-1** (Singapore, international DashScope).

### 1. Bootstrap RDS (accounts, database, public dev endpoint)

```bash
cd qwen-memory-mcp
cp .env.example .env   # fill QWEN_API_KEY + RAM keys
./deploy/bootstrap-rds.sh
```

Writes secrets to `.env.rds.generated` (gitignored). Copy `MYSQL_*` and
`MYSQL_HOST_PUBLIC` into `.env` for local dev.

### 2. Deploy Function Compute (custom runtime + bundled Node)

```bash
./deploy/deploy-fc.sh
```

Builds TypeScript, bundles Node + deps, creates VPC security group + FC role,
deploys via Serverless Devs (`fc3`), writes `DEPLOYED_MCP_URL` to `.env.integration`.

### 3. Verify

```bash
set -a && source .env && source .env.integration && set +a
npm run verify:deployed
```

## Deploy artifacts

| File | Purpose |
|------|---------|
| [`bootstrap-rds.sh`](bootstrap-rds.sh) | Idempotent RDS init (accounts, DB, public connection, IP whitelist) |
| [`aliyun-rds-api.mjs`](aliyun-rds-api.mjs) | RDS OpenAPI helper |
| [`deploy-fc.sh`](deploy-fc.sh) | Build + FC deploy (custom.debian10 + bundled Node) |
| [`aliyun-infra-api.mjs`](aliyun-infra-api.mjs) | ACR/SG/FC role/Serverless Devs helpers |
| [`render-s-yaml.mjs`](render-s-yaml.mjs) | Render `s.resolved.yaml` (gitignored) |
| [`fc-bootstrap.sh`](fc-bootstrap.sh) | FC startup script (runs bundled `./node`) |
| [`s.yaml`](s.yaml) | Serverless Devs template (reference) |

**Live FC URL (example):** `https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run`

FC uses the **private** RDS endpoint inside VPC; local `.env` uses the **public**
RDS endpoint for dev.

## Option A: ECS + Docker

See [docs/PHASE2-DEPLOYMENT-TESTING.md](../docs/PHASE2-DEPLOYMENT-TESTING.md).

## Security notes

- Never commit `.env`, `.env.integration`, or `.env.rds.generated`.
- RDS whitelist: your dev IP + vSwitch CIDR only (not `0.0.0.0/0`).
- `QWEN_API_KEY` and `MCP_AUTH_TOKEN` are backend-only.

## Cursor MCP: Alibaba FC tools

Repo root [`.cursor/mcp.json`](../../.cursor/mcp.json) registers
[alibabacloud-fc-mcp-server](https://github.com/aliyun/alibabacloud-fc-mcp-server).

1. Add RAM keys to `qwen-memory-mcp/.env`.
2. Run `npm install` in `qwen-memory-mcp/` (pins `alibabacloud-fc-mcp-server`).
3. Reload MCP in Cursor (Settings > MCP).

Wrapper: [`scripts/run-alibaba-fc-mcp.sh`](../scripts/run-alibaba-fc-mcp.sh)

### MCP troubleshooting

| Symptom | Fix |
|---------|-----|
| Server not listed | Confirm repo root `.cursor/mcp.json` uses **absolute** script path + `cwd` |
| `npx` timeout on first start | Run `npm install` in `qwen-memory-mcp/` so package is local |
| Auth errors | Check `ALIBABA_CLOUD_*` in `.env`; test: `bash scripts/run-alibaba-fc-mcp.sh` (should hang waiting for stdio - that is OK) |
| Missing FC permissions | Root account attaches `AliyunFCFullAccess`, `AliyunDevsFullAccess`, `AliyunVPCFullAccess`, `AliyunLogFullAccess` to RAM user `qwen-memory-deploy` |

RAM policies verified working for deploy: FC `GetFunction`, RDS admin, VPC/ECS SG,
RAM role create (`qwenMemoryFcVpcRole`).
