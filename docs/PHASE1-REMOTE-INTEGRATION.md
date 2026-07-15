# Phase 1: Remote Qwen integration

Validate the memory pipeline against **live DashScope (Qwen) APIs** from your
machine. No Alibaba ECS, RDS, or public URL required yet.

Master index: [TESTING-GUIDE.md](TESTING-GUIDE.md). Credentials:
[CREDENTIALS-AND-SETUP.md](CREDENTIALS-AND-SETUP.md).

---

## Goal

Prove that [`src/qwen.ts`](../src/qwen.ts) works with your API key and that
`MemoryService` + MCP HTTP transport behave correctly with real embeddings and
chat analysis - using `MEMORY_STORE=file` or in-memory storage locally.

---

## Prerequisites

- [ ] Phase 0 complete ([CREDENTIALS-AND-SETUP.md](CREDENTIALS-AND-SETUP.md))
- [ ] `QWEN_API_KEY` in `.env`
- [ ] `USE_FAKE_QWEN` unset or empty
- [ ] Correct `QWEN_BASE_URL` for your region

```bash
cd qwen-memory-mcp
npm install
cp .env.example .env
# edit .env
```

---

## Step 1: Quick DashScope ping

```bash
npm run verify:qwen
```

Expected output includes:

```text
[verify:qwen] PASS embed (dimensions=...)
[verify:qwen] PASS analyze (kind=..., salience=...)
[verify:qwen] All checks passed.
```

If this fails, fix API key and region before continuing.

---

## Step 2: Live demo (console)

```bash
npm run demo:live
```

This runs [`demo/cli.ts`](../demo/cli.ts) with real Qwen intelligence. You should
see:

- `Intelligence: qwen(qwen-plus + text-embedding-v3)` (not `fake`)
- Session 1 writes with derived tags/kind/salience
- Search and recall ranked results
- Forget pass consolidates or decays memories

---

## Step 3: Automated integration tests

```bash
npm run test:integration
```

With `QWEN_API_KEY` set, these run:

| File | What it checks |
|------|----------------|
| `test/qwen-remote.integration.test.ts` | embed, analyze, consolidate on QwenIntelligence |
| `test/service-qwen.integration.test.ts` | write, search, recall, forget via MemoryService |
| `test/http-mcp.integration.test.ts` | local HTTP server, MCP tools/list and tools/call |

Without the key, files skip (exit 0).

Run only Qwen tests:

```bash
./node_modules/.bin/vitest run test/qwen-remote.integration.test.ts
```

---

## Step 4: Local HTTP server (manual / MCP Inspector)

Start a local HTTP MCP server:

```bash
npm run build
./scripts/run-integration-server.sh
```

Or manually:

```bash
MCP_TRANSPORT=http \
PORT=8080 \
MCP_AUTH_TOKEN=test-token \
MEMORY_STORE=file \
QWEN_API_KEY=your-key \
npm start
```

Health check:

```bash
curl -s http://127.0.0.1:8080/health | jq .
```

MCP tools list:

```bash
curl -s http://127.0.0.1:8080/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer test-token" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

You can point [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
at `http://127.0.0.1:8080/mcp` with the Bearer header.

**Dev server with live Qwen:** `npm run dev` loads `.env` automatically. Default
transport is stdio; for HTTP:

```bash
MCP_TRANSPORT=http npm run dev
curl -s http://127.0.0.1:8080/health | jq .intelligence
```

Expect `qwen(qwen-plus + text-embedding-v3)` when `QWEN_API_KEY` is set and
`USE_FAKE_QWEN` is unset.

---

## Step 5: Optional MySQL store (local only)

Not required for Phase 1. De-risks RDS config before Phase 2:

```bash
docker compose -f docker-compose.integration.yml up -d
export MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 \
  MYSQL_USER=qwen_memory MYSQL_PASSWORD=qwen_memory \
  MYSQL_DATABASE=qwen_memory
npm run test:integration
# runs mysql-store.integration.test.ts when MYSQL_* is set
```

This uses local Docker MySQL - **not** hackathon Alibaba proof.

---

## Pass criteria

| Check | How to verify |
|-------|---------------|
| Embeddings work | `verify:qwen` PASS embed |
| Analysis JSON valid | `verify:qwen` PASS analyze |
| Full lifecycle | `service-qwen.integration.test.ts` green |
| MCP over HTTP | `http-mcp.integration.test.ts` green |
| Real intelligence | `/health` or demo label contains `qwen(` |

---

## Out of scope for Phase 1

- Alibaba ECS / Function Compute
- RDS / PolarDB (except optional local Docker)
- Public HTTPS URL

Next: [PHASE2-DEPLOYMENT-TESTING.md](PHASE2-DEPLOYMENT-TESTING.md).

---

## Cost note

Each integration run uses several embed + chat API calls. A full
`test:integration` pass is typically well under $1. Avoid running it in a tight
loop. See [CREDENTIALS-AND-SETUP.md](CREDENTIALS-AND-SETUP.md#cost-guardrails).
