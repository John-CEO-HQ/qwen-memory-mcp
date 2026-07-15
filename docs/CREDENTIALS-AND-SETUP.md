# Credentials and setup checklist

Everything you need to register, create, and store before running the
three-phase testing guide. **Never commit real secrets** - keep them in a
local `.env` file (gitignored).

For the full testing workflow, start at [TESTING-GUIDE.md](TESTING-GUIDE.md).

---

## Registrations (in order)

| Step | Where | What you get | Notes |
|------|-------|--------------|-------|
| 1 | [Devpost hackathon](https://qwencloud-hackathon.devpost.com/) | Submission portal | Click **Join Hackathon**; required to compete |
| 2 | [Qwen Cloud](https://www.qwencloud.com/) | Account + trial credits | Check quota at [benefits page](https://home.qwencloud.com/benefits) |
| 3 | Alibaba Cloud console | ECS, RDS, ACR access | Often the same account as Qwen Cloud; billing is separate from DashScope quota |
| 4 | Qwen Cloud Discord | Community support | Linked from the Devpost page; optional but useful |

### Hackathon credits

- New accounts may receive a free trial quota on Qwen Cloud.
- If you are not eligible for a free trial, request the **$40 hackathon voucher**
  via the coupon form linked from the [Devpost rules](https://qwencloud-hackathon.devpost.com/rules)
  (search for "coupon form" on that page).
- DashScope usage beyond the voucher is billed to your Alibaba Cloud account.

---

## Secrets to gather

Copy [`.env.example`](../.env.example) to `.env` and fill in values. For
integration-only variables, see [`.env.integration.example`](../.env.integration.example).

| Variable | Source | Used in |
|----------|--------|---------|
| `QWEN_API_KEY` | Qwen Cloud / Model Studio (DashScope) API keys console | Phase 1+ |
| `QWEN_BASE_URL` | Must match your account region (see below) | Phase 1+ |
| `QWEN_CHAT_MODEL` | Default `qwen-plus`; override if your region differs | Phase 1+ |
| `QWEN_EMBEDDING_MODEL` | Default `text-embedding-v3` | Phase 1+ |
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | RAM sub-user AccessKey | Cursor FC MCP deploy |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | RAM sub-user secret | Cursor FC MCP deploy |
| `MYSQL_HOST` | RDS or PolarDB instance endpoint | Phase 2 production |
| `MYSQL_PORT` | Usually `3306` | Phase 2 |
| `MYSQL_USER` | Database user you create | Phase 2 |
| `MYSQL_PASSWORD` | Database password | Phase 2 |
| `MYSQL_DATABASE` | e.g. `qwen_memory` | Phase 2 |
| `MCP_AUTH_TOKEN` | Generate locally: `openssl rand -base64 24` | Phase 2 HTTP auth |
| `DEPLOYED_MCP_URL` | Public HTTPS base URL (no trailing slash) | Phase 2 verify scripts |
| `INTEGRATION_TEST_USER_ID` | Any stable test id, e.g. `integration-test-user` | Integration tests |

### Judge / Devpost-only (not in `.env`)

If your deployed URL is private, prepare **testing instructions** for judges:

- Public HTTPS URL (or VPN steps)
- `MCP_AUTH_TOKEN` value (rotate after the hackathon)
- Example curl from [scripts/smoke-mcp-http.sh](../scripts/smoke-mcp-http.sh)

---

## Region decision tree

Pick **one** region and keep Qwen API URL, compute, and RDS in the same region.

### International (Singapore) - recommended for most hackathon entrants outside mainland China

```bash
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

Deploy ECS/RDS in **ap-southeast-1** (Singapore) or another intl region that
matches your DashScope key.

### Mainland China (Beijing)

```bash
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

Deploy ECS/RDS in **cn-beijing** or your local region.

**Mismatch symptom:** `401` or `403` from DashScope, or "model not found" errors.
Fix by aligning `QWEN_BASE_URL` with where the API key was issued.

---

## How to create each secret

### 1. QWEN_API_KEY

1. Log in to [Qwen Cloud](https://www.qwencloud.com/).
2. Open Model Studio / DashScope API keys (wording may vary by console version).
3. Create an API key with chat + embedding access.
4. Paste into `.env` as `QWEN_API_KEY=...`.
5. Confirm `USE_FAKE_QWEN` is **unset** or empty when testing live Qwen.

Quick check:

```bash
cd qwen-memory-mcp
npm run verify:qwen
```

### 1b. Alibaba Cloud RAM (Function Compute MCP in Cursor)

For AI-assisted FC deploy via Cursor, add to `qwen-memory-mcp/.env`:

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`

Create a **RAM sub-user** (not root). Minimum: `AliyunFCFullAccess`; also
`AliyunDevsFullAccess`, `AliyunVPCFullAccess`, `AliyunLogFullAccess` for full FC
workflows. See [deploy/README.md](../deploy/README.md#cursor-mcp-deploy-to-function-compute-from-the-ide).

Reload MCP in Cursor after editing `.cursor/mcp.json` or `.env`.

### 2. MCP_AUTH_TOKEN

Generate once per deployment:

```bash
openssl rand -base64 24
```

Set the same value on the server (ECS/FC env) and in your local `.env` when
running `verify:deployed` or integration tests against the deploy.

### 3. MySQL (RDS / PolarDB)

**Automated (recommended):**

```bash
cd qwen-memory-mcp
./deploy/bootstrap-rds.sh
# Copy MYSQL_* from .env.rds.generated into .env (public host for local dev)
```

**Manual console steps:**

1. In Alibaba Cloud console, create **RDS MySQL** or **PolarDB for MySQL**.
2. Same region as your ECS/Function Compute instance (`ap-southeast-1` for intl).
3. Create database `qwen_memory` and user `qwen_memory`.
4. **Security group:** allow inbound TCP **3306** from your dev IP and FC vSwitch CIDR.
5. Allocate a **public connection** for local dev; FC uses the private endpoint.

Local pre-flight (optional, not Alibaba proof):

```bash
docker compose -f docker-compose.integration.yml up -d
# MYSQL_HOST=127.0.0.1 MYSQL_USER=qwen_memory MYSQL_PASSWORD=qwen_memory MYSQL_DATABASE=qwen_memory
```

### 4. DEPLOYED_MCP_URL

After FC deploy:

```bash
./deploy/deploy-fc.sh   # writes .env.integration automatically
npm run verify:deployed
```

Or set manually to your public FC HTTP trigger URL (no trailing slash):

```bash
DEPLOYED_MCP_URL=https://memory.yourdomain.com
```

Scripts append `/health` and `/mcp` automatically. Do not include a trailing slash.

---

## Cost guardrails

| Resource | Typical hackathon cost | Notes |
|----------|------------------------|-------|
| DashScope (Qwen) | Within $40 voucher if you avoid huge loops | Each integration run uses a handful of embed + chat calls |
| ECS (small) | ~USD few dollars/week if left running | Stop instance when not testing |
| RDS (small) | ~USD few dollars/week | Smallest MySQL tier is enough |
| SLB | Low for demo traffic | Required for stable HTTPS URL for judges |

**Recommendations:**

- Run `npm test` (offline) frequently; run `npm run test:integration` selectively.
- Do not wire integration tests into CI by default (token cost + flaky network).
- Tear down ECS/RDS after submission if you no longer need the demo host.

---

## `.env` workflow

```bash
cd qwen-memory-mcp
cp .env.example .env
# Edit .env with QWEN_API_KEY and other secrets

# Optional: copy integration template for Phase 2 vars
cp .env.integration.example .env.integration
# Source both when running deploy verification:
set -a && source .env && source .env.integration && set +a
npm run verify:deployed
```

`.env` and `.env.integration` are gitignored. Never commit them.

---

## Pre-flight checklist

Before [Phase 1](PHASE1-REMOTE-INTEGRATION.md):

- [ ] Devpost registration complete
- [ ] Qwen Cloud account with API key
- [ ] `.env` created with `QWEN_API_KEY` and correct `QWEN_BASE_URL`
- [ ] `npm install` in `qwen-memory-mcp/`
- [ ] `npm run verify:qwen` passes

Before [Phase 2](PHASE2-DEPLOYMENT-TESTING.md):

- [ ] RDS/PolarDB MySQL running (same region as compute)
- [ ] ECS or Function Compute deployed with Docker image
- [ ] `MEMORY_STORE=mysql`, `MCP_TRANSPORT=http`, secrets set on server
- [ ] HTTPS URL reachable from the public internet
- [ ] `DEPLOYED_MCP_URL` and `MCP_AUTH_TOKEN` in local env
- [ ] `npm run verify:deployed` passes

---

## Related docs

- [TESTING-GUIDE.md](TESTING-GUIDE.md) - master testing index
- [PHASE1-REMOTE-INTEGRATION.md](PHASE1-REMOTE-INTEGRATION.md)
- [PHASE2-DEPLOYMENT-TESTING.md](PHASE2-DEPLOYMENT-TESTING.md)
- [INSTALL.md](INSTALL.md) - install and deploy details
- [deploy/README.md](../deploy/README.md) - Alibaba quick reference
