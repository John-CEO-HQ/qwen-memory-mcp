# Judge testing instructions

English instructions for hackathon judges and Devpost "Testing instructions" field.

## Live demo

| Item | Value |
|------|-------|
| Base URL | `https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run` |
| Health | `GET /health` (no auth) |
| MCP endpoint | `POST /mcp` (Bearer token required) |
| Auth header | `Authorization: Bearer <MCP_AUTH_TOKEN>` |
| `MCP_AUTH_TOKEN` | See Devpost submission testing instructions (field 16) |

The sponsor provides `MCP_AUTH_TOKEN` in Devpost testing instructions (not in this repo). The value may contain `/`; always quote it in shell commands. First request after idle may take 10-20 seconds (Function Compute cold start).

## Quick health check

```bash
curl -s https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run/health
```

Expected: `"ok": true` and `"intelligence": "qwen(qwen-plus + text-embedding-v3)"`.

## Automated verification (recommended)

Clone the public repository, then:

```bash
git clone https://github.com/John-CEO-HQ/qwen-memory-mcp
cd qwen-memory-mcp
npm install
cp .env.integration.example .env.integration
# Edit .env.integration:
#   DEPLOYED_MCP_URL=https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run
#   MCP_AUTH_TOKEN=<from Devpost field 16>
npm run verify:deployed
```

Expected output ends with: `All checks passed.`

This runs: health, `tools/list` (4 tools), `memory_write`, `memory_search`, `memory_recall_context`, `memory_forget`.

## Manual smoke script

```bash
export BASE_URL=https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run
export MCP_AUTH_TOKEN='<from Devpost>'
./scripts/smoke-mcp-http.sh
```

Requires `curl`, `jq`, and `node` (for MCP JSON parsing).

## Alibaba Cloud proof (code)

| Proof | File |
|-------|------|
| Qwen / DashScope API | [`src/qwen.ts`](../src/qwen.ts) |
| RDS MySQL persistence | [`src/memory/mysql-store.ts`](../src/memory/mysql-store.ts) |

Infrastructure: Alibaba Cloud **Function Compute** (ap-southeast-1) + **RDS MySQL 8.0** (same region). Qwen models via **Qwen Cloud** (DashScope international).

## Architecture

See [`docs/architecture.png`](architecture.png) or the mermaid diagram in [`README.md`](../README.md).

## Persistence check (optional)

1. Run `verify:deployed` or `memory_write` with a unique string.
2. Wait 2+ minutes (cold start) or redeploy the function.
3. `memory_search` for the same string - it must still exist (stored in RDS, not in-memory).

## Security note

Rotate `MCP_AUTH_TOKEN` after the judging period ends.
