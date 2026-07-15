# Install and deploy guide

Step-by-step instructions for installing, running, and deploying **Qwen Memory
MCP** locally and on Alibaba Cloud.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js 20+** | Matches `engines` in `package.json`. |
| **npm** | This module uses its own `package.json` and `package-lock.json`. |
| **Docker** (optional) | For production image builds on ECS. |
| **Qwen / DashScope API key** | Required for production intelligence. Local demo/tests work without one. |
| **Alibaba RDS or PolarDB for MySQL** | Recommended for production persistence. |

---

## Troubleshooting: folder looks empty

If your editor shows missing files:

1. **Unpushed commits** - Pull or clone the latest from
   https://github.com/John-CEO-HQ/qwen-memory-mcp
2. **No `dist/` yet** - `dist/` is gitignored. Run `npm run build` to create it.
3. **Quick verify**:

```bash
ls src
npm test
```

---

## Local install

```bash
git clone https://github.com/John-CEO-HQ/qwen-memory-mcp
cd qwen-memory-mcp
npm install
cp .env.example .env    # optional: set QWEN_API_KEY for real Qwen
npm test
npm run demo
npm run typecheck
npm run build
```

Without `QWEN_API_KEY`, the server uses **offline deterministic intelligence**
(`FakeIntelligence`). The demo and all tests run with no network access.

To use real Qwen models, set in `.env`:

```bash
QWEN_API_KEY=your-dashscope-key
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1   # or Beijing URL
USE_FAKE_QWEN=                                                          # unset or empty
```

---

## npm prefix workaround (nested checkout)

If this repo lives inside a larger parent project, `npm prefix` may resolve to the
**parent** root. That can make `npm run test` run the wrong scripts.

Use local binaries explicitly:

```bash
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsx demo/cli.ts
```

Or clone https://github.com/John-CEO-HQ/qwen-memory-mcp to a standalone path.

---

## Run modes

### stdio (local MCP clients)

Default transport. Used by MCP Inspector, Claude Desktop, and local agent
processes that spawn the server as a child.

```bash
npm run build
npm start
# or during development:
npm run dev
```

Environment (optional):

```bash
MCP_TRANSPORT=stdio
MEMORY_STORE=file
```

### HTTP (cloud and remote agents)

Used for Alibaba Cloud deployment and for remote MCP clients over the network
(e.g. Hermes or other agent gateways).

```bash
npm run build
MCP_TRANSPORT=http \
PORT=8080 \
MCP_AUTH_TOKEN="$(head -c 24 /dev/urandom | base64)" \
QWEN_API_KEY=your-key \
MEMORY_STORE=mysql \
MYSQL_HOST=... \
npm start
```

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/health` | GET | none | Liveness check |
| `/mcp` | POST | `Authorization: Bearer <MCP_AUTH_TOKEN>` | MCP Streamable HTTP (JSON-RPC) |

Example health check:

```bash
curl -s http://127.0.0.1:8080/health | jq .
```

Example MCP `tools/list`:

```bash
curl -s http://127.0.0.1:8080/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer $MCP_AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Storage options

| `MEMORY_STORE` | Use case |
|----------------|----------|
| `memory` | Ephemeral in-process store (tests, quick experiments). |
| `file` | Single JSON file at `MEMORY_FILE_PATH` (local default). |
| `mysql` | Production on Alibaba RDS / PolarDB. Schema auto-created on boot. |

For production, set `MEMORY_STORE=mysql` and all `MYSQL_*` variables. See
[`.env.example`](../.env.example).

---

## Production on Alibaba Cloud

### 1. Qwen / DashScope

1. Sign up at [Qwen Cloud](https://www.qwencloud.com) and enable Model Studio
   (DashScope).
2. Create an API key.
3. Set `QWEN_API_KEY` and the correct regional base URL:

| Region | `QWEN_BASE_URL` |
|--------|-----------------|
| International (Singapore) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| Mainland China (Beijing) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

Code reference (hackathon proof file): [`src/qwen.ts`](../src/qwen.ts).

### 2. RDS or PolarDB for MySQL

1. Create an RDS or PolarDB for MySQL instance in the same region as your
   compute.
2. Create a database (e.g. `qwen_memory`) and a dedicated user.
3. Security group: allow inbound MySQL (3306) **only** from your ECS instance or
   Function Compute VPC - not from the public internet.
4. Set environment variables:

```bash
MEMORY_STORE=mysql
MYSQL_HOST=rm-xxxx.mysql.rds.aliyuncs.com
MYSQL_PORT=3306
MYSQL_USER=qwen_memory
MYSQL_PASSWORD=...
MYSQL_DATABASE=qwen_memory
```

Code reference (hackathon proof file): [`src/memory/mysql-store.ts`](../src/memory/mysql-store.ts).

The `memories` table is created automatically on first boot.

### 3. ECS with Docker

On an ECS instance with Docker installed, from the module root:

```bash
docker build -t qwen-memory-mcp .
docker run -d --name qwen-memory-mcp --restart unless-stopped -p 8080:8080 \
  -e MCP_TRANSPORT=http \
  -e QWEN_API_KEY=*** \
  -e QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1 \
  -e MEMORY_STORE=mysql \
  -e MYSQL_HOST=*** \
  -e MYSQL_USER=*** \
  -e MYSQL_PASSWORD=*** \
  -e MYSQL_DATABASE=qwen_memory \
  -e MCP_AUTH_TOKEN="$(head -c 24 /dev/urandom | base64)" \
  qwen-memory-mcp
```

- MCP endpoint: `http://<ecs-ip>:8080/mcp` (POST, Bearer token)
- Health: `http://<ecs-ip>:8080/health`

For production, put the service behind **Server Load Balancer (SLB/ALB)** with
HTTPS and restrict direct access to port 8080.

See also [deploy/README.md](../deploy/README.md) for a shorter Alibaba quick
reference.

### 4. Function Compute (serverless)

The HTTP transport runs in **stateless** mode (one MCP session per request),
which fits Function Compute.

1. Build and push the Docker image to Alibaba Container Registry (ACR).
2. Create a Function Compute function from the custom container image.
3. Add an HTTP trigger; route `/mcp` and `/health` to the function.
4. Set the same environment variables as the ECS example above.
5. Ensure the function can reach RDS over VPC peering or internal network.

### 5. Verify deployment

```bash
# Health
curl -s https://<your-host>/health

# MCP tools list
curl -s https://<your-host>/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer $MCP_AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

You should see `memory_write`, `memory_search`, `memory_recall_context`, and
`memory_forget` in the response.

### 6. Hackathon submission checklist

| Requirement | Where to point judges |
|-------------|----------------------|
| Code uses Alibaba Cloud / Qwen | [`src/qwen.ts`](../src/qwen.ts) (DashScope API calls) |
| Backend on Alibaba Cloud | [`src/memory/mysql-store.ts`](../src/memory/mysql-store.ts) + deployed host |
| Architecture diagram | [`README.md`](../README.md) mermaid diagrams |
| Working demo | Screen recording of `npm run demo` or live HTTP curls against deployed host |
| Proof of Alibaba deployment | Short recording showing ECS/FC console + `curl /health` against your host |

---

## Environment reference

Full variable list: [`.env.example`](../.env.example).

Key groups:

- **Qwen:** `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_CHAT_MODEL`, `QWEN_EMBEDDING_MODEL`, `USE_FAKE_QWEN`
- **Storage:** `MEMORY_STORE`, `MEMORY_FILE_PATH`, `MYSQL_*`
- **Transport:** `MCP_TRANSPORT`, `PORT`, `MCP_AUTH_TOKEN`
- **Forgetting tuning:** `MEMORY_DECAY_HALF_LIFE_DAYS`, `MEMORY_CONSOLIDATE_SIMILARITY`, `MEMORY_RETENTION_THRESHOLD`, `MEMORY_SALIENCE_FLOOR`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `npm run test` runs wrong project's tests | npm prefix walked to parent repo | Use `./node_modules/.bin/vitest run` from repo root |
| Server starts but uses fake intelligence | Missing `QWEN_API_KEY`, or `USE_FAKE_QWEN=1` | Put key in `.env` (auto-loaded by `npm run dev`, `npm start`, and `npm run demo`). Fallback: `set -a && source .env && set +a`. Unset `USE_FAKE_QWEN` for live Qwen |
| HTTP returns 401 | Missing or wrong `MCP_AUTH_TOKEN` | Pass `Authorization: Bearer <token>` matching server env |
| MySQL connection fails on boot | Security group or wrong `MYSQL_*` | Allow ECS/FC -> RDS on 3306; verify credentials |
| `dist/` missing | Not built yet | Run `npm run build` |
| Memories lost after restart with `MEMORY_STORE=memory` | Expected - in-memory only | Use `file` or `mysql` for persistence |

---

## Next steps

- **Testing (hackathon):** [docs/TESTING-GUIDE.md](TESTING-GUIDE.md)
- **Alibaba quick reference:** [deploy/README.md](../deploy/README.md)
- **Module overview:** [README.md](../README.md)
