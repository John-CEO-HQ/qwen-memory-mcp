# Phase 2: Deployment testing

Deploy **Qwen Memory MCP** on Alibaba Cloud and verify the **live HTTPS**
endpoint with automated and manual tests.

Prerequisites: [Phase 1](PHASE1-REMOTE-INTEGRATION.md) passed.
Credentials: [CREDENTIALS-AND-SETUP.md](CREDENTIALS-AND-SETUP.md).
Install details: [INSTALL.md](INSTALL.md).

---

## Goal

- Backend running on Alibaba Cloud (ECS or Function Compute)
- Persistence on Alibaba RDS / PolarDB MySQL
- Public HTTPS URL for judges
- Automated `verify:deployed` + manual smoke script PASS

---

## ECS vs Function Compute

Document both paths. **Start with ECS** unless you already run serverless on Alibaba.

| | **ECS + Docker (recommended first)** | **Function Compute (FC)** |
|---|--------------------------------------|---------------------------|
| **Why choose** | Easiest judge reproduction; long-lived process; SSH + `docker logs`; matches [`Dockerfile`](../Dockerfile) as-is | Pay per request; no idle VM cost |
| **Why avoid first** | Small always-on VM + RDS cost | Cold starts; VPC + RDS wiring; harder live debugging |
| **Hackathon proof** | ECS console + RDS + curl | FC console + RDS + curl |
| **Best for** | Demo URL, judges, integration tests | Low-traffic or cost-sensitive after hackathon |

---

## Shared setup (both ECS and FC)

### 1. RDS or PolarDB for MySQL

1. Create instance in the **same region** as compute and DashScope key.
2. Database: `qwen_memory` (or your choice; set `MYSQL_DATABASE`).
3. User with full access to that database.
4. Security group: **3306 only from compute VPC** - never open MySQL to `0.0.0.0/0`.

Env on the server:

```bash
MEMORY_STORE=mysql
MYSQL_HOST=rm-xxxx.mysql.rds.aliyuncs.com
MYSQL_PORT=3306
MYSQL_USER=qwen_memory
MYSQL_PASSWORD=...
MYSQL_DATABASE=qwen_memory
```

Proof file: [`src/memory/mysql-store.ts`](../src/memory/mysql-store.ts).

### 2. Qwen / DashScope (server env)

```bash
QWEN_API_KEY=...
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_CHAT_MODEL=qwen-plus
QWEN_EMBEDDING_MODEL=text-embedding-v3
```

Proof file: [`src/qwen.ts`](../src/qwen.ts).

### 3. HTTP transport + auth

```bash
MCP_TRANSPORT=http
PORT=8080
MCP_AUTH_TOKEN=<openssl rand -base64 24>
```

---

## Option A: ECS + Docker

### Provision

1. ECS instance (e.g. 1 vCPU, 2 GB) in target region.
2. Install Docker.
3. Open security group: **443** (and 80 if redirecting) from internet; **8080** only if testing without SLB (not recommended for judges).

### Deploy

On the ECS host, from a copy of this repo or uploaded tarball:

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
  -e MCP_AUTH_TOKEN=*** \
  qwen-memory-mcp
```

### HTTPS (recommended for judges)

Put **Server Load Balancer (SLB/ALB)** in front:

- Listener 443 -> backend ECS:8080
- TLS certificate (Alibaba free cert or your own)
- Public hostname e.g. `memory.yourdomain.com`

Set `DEPLOYED_MCP_URL=https://memory.yourdomain.com` locally.

### Debug

```bash
docker logs qwen-memory-mcp --tail 100
curl -s http://127.0.0.1:8080/health
```

---

## Option B: Function Compute

1. Build image: `docker build -t qwen-memory-mcp .`
2. Push to **Alibaba Container Registry (ACR)**.
3. Create FC function from custom container image.
4. HTTP trigger for `/health` and `/mcp`.
5. Attach function to **VPC** that can reach RDS on 3306.
6. Set the same environment variables as ECS.

Stateless HTTP mode (one MCP session per request) matches FC's request model -
see [`src/transports/http.ts`](../src/transports/http.ts).

---

## Verification

### Automated (from your laptop)

```bash
cd qwen-memory-mcp
cp .env.integration.example .env.integration
# Set DEPLOYED_MCP_URL and MCP_AUTH_TOKEN

set -a && source .env && source .env.integration && set +a
npm run verify:deployed
```

Or inline:

```bash
DEPLOYED_MCP_URL=https://memory.yourdomain.com \
MCP_AUTH_TOKEN=your-token \
npm run verify:deployed
```

Expected:

```text
[verify:deployed] PASS health
[verify:deployed] PASS tools/list (4 tools)
[verify:deployed] PASS memory_write
[verify:deployed] PASS memory_search
[verify:deployed] PASS memory_recall_context
[verify:deployed] PASS memory_forget
[verify:deployed] All checks passed.
```

### Vitest against deploy

```bash
DEPLOYED_MCP_URL=... MCP_AUTH_TOKEN=... npm run test:integration
```

Runs `test/deployed.integration.test.ts`.

### Manual smoke (judges / screen recording)

```bash
export BASE_URL=https://memory.yourdomain.com
export MCP_AUTH_TOKEN=your-token
./scripts/smoke-mcp-http.sh
```

Requires `curl` and `jq`.

### Persistence test (proves RDS)

1. Run `verify:deployed` or write a memory via smoke script.
2. Restart container: `docker restart qwen-memory-mcp`
3. Search for the same memory again - it must still exist.

---

## Pass criteria

| Check | Evidence |
|-------|----------|
| Health over HTTPS | `curl $DEPLOYED_MCP_URL/health` -> `ok: true` |
| Four MCP tools | smoke script or verify:deployed |
| Auth enforced | curl without Bearer -> 401 |
| Alibaba compute | ECS or FC console screenshot for video |
| Alibaba database | RDS console + restart persistence test |
| Code proof links | `src/qwen.ts`, `src/memory/mysql-store.ts` in Devpost |

---

## Optional: local MySQL before RDS

```bash
docker compose -f docker-compose.integration.yml up -d
export MYSQL_HOST=127.0.0.1 MYSQL_USER=qwen_memory \
  MYSQL_PASSWORD=qwen_memory MYSQL_DATABASE=qwen_memory
npm run test:integration
```

Valid for engineering confidence only - **not** a substitute for RDS in submission.

---

## Demo video tips (~3 minutes)

1. Show architecture diagram from [README.md](../README.md).
2. Show Alibaba console (ECS/FC + RDS).
3. Run `./scripts/smoke-mcp-http.sh` or `verify:deployed`.
4. Optional: show `npm run demo:live` for offline intelligence comparison.

Upload to YouTube/Vimeo public; link in Devpost.

**Published demo:** https://www.youtube.com/watch?v=ZxXKvVY6iMQ

---

## Next steps

- Submission checklist: [TESTING-GUIDE.md](TESTING-GUIDE.md#hackathon-submission-checklist)
