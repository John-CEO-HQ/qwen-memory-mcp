# Deploying Qwen Memory MCP on Alibaba Cloud

For full local install, monorepo notes, and step-by-step production setup, see
[docs/INSTALL.md](../docs/INSTALL.md). For John CEO wiring, see
[docs/JOHN-CEO-INTEGRATION.md](../docs/JOHN-CEO-INTEGRATION.md).

This server is designed to run its backend on Alibaba Cloud and call Qwen via
Alibaba Cloud Model Studio (DashScope). Two deployment shapes are supported;
both use the same image and env vars.

The Alibaba Cloud integration lives in two files, which double as the
"proof of Alibaba Cloud deployment" for judging:

- [`src/qwen.ts`](../src/qwen.ts) - calls DashScope (Qwen embeddings + chat).
- [`src/memory/mysql-store.ts`](../src/memory/mysql-store.ts) - persists to
  Alibaba Cloud RDS / PolarDB for MySQL.

## Prerequisites

1. An Alibaba Cloud account with Model Studio (DashScope) enabled; create an
   API key. Set `QWEN_API_KEY`.
2. Pick the correct DashScope region base URL in `QWEN_BASE_URL`:
   - International (Singapore): `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
   - Mainland China (Beijing): `https://dashscope.aliyuncs.com/compatible-mode/v1`
3. (Recommended) An RDS or PolarDB for MySQL instance. Set `MEMORY_STORE=mysql`
   and the `MYSQL_*` variables. The table is created automatically on boot.

## Option A: Elastic Compute Service (ECS) with Docker

```bash
# On an ECS instance with Docker installed:
docker build -t qwen-memory-mcp .
docker run -d --name qwen-memory-mcp -p 8080:8080 \
  -e QWEN_API_KEY=*** \
  -e QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1 \
  -e MEMORY_STORE=mysql \
  -e MYSQL_HOST=*** -e MYSQL_USER=*** -e MYSQL_PASSWORD=*** -e MYSQL_DATABASE=qwen_memory \
  -e MCP_AUTH_TOKEN=$(head -c 24 /dev/urandom | base64) \
  qwen-memory-mcp
# MCP endpoint: http://<ecs-public-ip>:8080/mcp   (POST, Bearer token)
# Health:       http://<ecs-public-ip>:8080/health
```

Put it behind Server Load Balancer (SLB/ALB) + HTTPS for production.

## Option B: Function Compute (serverless)

The HTTP transport runs in **stateless** mode (a fresh MCP session per request),
which fits Function Compute's request model.

1. Create a Function Compute service and a function using a **custom container**
   (this image) or the Node.js 20+ runtime.
2. Set the function HTTP trigger and the same environment variables as above.
3. Map the function to listen on `PORT` and route `/mcp` + `/health`.

## Verifying

```bash
# Health
curl https://<host>/health

# List tools over MCP (Streamable HTTP, single JSON-RPC request)
curl -s https://<host>/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer $MCP_AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Security notes

- `QWEN_API_KEY` and `MCP_AUTH_TOKEN` are backend-only secrets. Never embed them
  in a client or ship them to an end-user device. Inject them as Function
  Compute / ECS environment variables (or via Alibaba Cloud KMS / Secrets
  Manager).
- When a host application mounts this server per user, hand each user a scoped
  URL that carries its own `MCP_AUTH_TOKEN`; rotate tokens out-of-band.
