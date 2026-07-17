# Testing guide (master index)

End-to-end testing for **Qwen Memory MCP** across two phases: remote Qwen
integration and Alibaba Cloud deployment verification.

All commands run from the **repository root** after `npm install`.

**Hackathon:** Track 1 - MemoryAgent. Submission deadline **Jul 20, 2026**.

**Repository:** https://github.com/John-CEO-HQ/qwen-memory-mcp

---

## Overview

```mermaid
flowchart TD
  phase0["Phase 0: Accounts and keys"] --> phase1["Phase 1: Remote Qwen integration"]
  phase1 --> phase2["Phase 2: Alibaba deploy + live MCP tests"]
  phase1 -->|"file store OK"| phase2
  phase2 -->|"RDS required"| judges["Judge-ready demo"]
```

| Phase | Doc | Needs network | Needs Alibaba compute |
|-------|-----|---------------|----------------------|
| 0 | [CREDENTIALS-AND-SETUP.md](CREDENTIALS-AND-SETUP.md) | Signup only | No |
| 1 | [PHASE1-REMOTE-INTEGRATION.md](PHASE1-REMOTE-INTEGRATION.md) | Yes (DashScope) | No |
| 2 | [PHASE2-DEPLOYMENT-TESTING.md](PHASE2-DEPLOYMENT-TESTING.md) | Yes | Yes (ECS/FC + RDS) |

---

## Command cheat sheet

| Command | Phase | Requires |
|---------|-------|----------|
| `npm test` | Offline unit tests | Nothing (uses fake Qwen) |
| `npm run verify:qwen` | 1 | `QWEN_API_KEY` in `.env` |
| `npm run demo` | 1 offline | Nothing |
| `npm run demo:live` | 1 live | `QWEN_API_KEY` |
| `npm run test:integration` | 1-2 | See per-file env below |
| `npm run verify:deployed` | 2 | `DEPLOYED_MCP_URL`, `MCP_AUTH_TOKEN` |
| `./scripts/smoke-mcp-http.sh` | 2 manual | `BASE_URL`, `MCP_AUTH_TOKEN` env |
| `./scripts/run-integration-server.sh` | 1 local HTTP | `.env` with Qwen key |

### Integration test env matrix

| Test file | Required env |
|-----------|--------------|
| `qwen-remote.integration.test.ts` | `QWEN_API_KEY` |
| `service-qwen.integration.test.ts` | `QWEN_API_KEY` |
| `http-mcp.integration.test.ts` | `QWEN_API_KEY` |
| `mysql-store.integration.test.ts` | `MYSQL_*` |
| `deployed.integration.test.ts` | `DEPLOYED_MCP_URL`, `MCP_AUTH_TOKEN` |

Tests **skip automatically** when env is missing, so `npm run test:integration`
is safe to run without keys (everything skips).

---

## Pass / fail criteria

### Phase 1 - Remote Qwen integration

- [ ] `npm run verify:qwen` prints PASS for embed and analyze
- [ ] `npm run demo:live` completes without error
- [ ] Integration tests for Qwen + service + HTTP pass
- [ ] `/health` shows intelligence label containing `qwen(` not `fake`

### Phase 2 - Deployment testing

- [ ] HTTPS `/health` returns `ok: true`
- [ ] All four MCP tools respond over POST `/mcp`
- [ ] `npm run verify:deployed` PASS
- [ ] Memory survives container restart (proves RDS, not in-memory)
- [ ] Submission links: [`src/qwen.ts`](../src/qwen.ts), [`src/memory/mysql-store.ts`](../src/memory/mysql-store.ts)

---

## Suggested timeline (6 days to deadline)

| Day | Focus |
|-----|-------|
| 1 | Phase 0 + Phase 1: accounts, `.env`, `verify:qwen`, `test:integration` |
| 2-3 | Phase 2 setup: RDS, ECS, Docker deploy, HTTPS |
| 4 | Phase 2 verify: `verify:deployed`, restart test, record demo video |
| 5 | Submission: public repo, architecture diagram, Devpost form |
| 6 | Buffer / optional blog post prize |

---

## Hackathon submission checklist

Use this when filling out [Devpost](https://qwencloud-hackathon.devpost.com/).

| Requirement | Your artifact |
|-------------|---------------|
| Track | **Track 1: MemoryAgent** |
| Public MIT repo | https://github.com/John-CEO-HQ/qwen-memory-mcp |
| Proof of Alibaba Cloud | Link [`src/qwen.ts`](../src/qwen.ts) + [`src/memory/mysql-store.ts`](../src/memory/mysql-store.ts) + deployed URL |
| Architecture diagram | [`docs/architecture.png`](architecture.png) (source: [`docs/architecture.mmd`](architecture.mmd)) |
| Judge testing instructions | [`docs/JUDGE-TESTING.md`](JUDGE-TESTING.md) |
| Remaining submission tasks | [`docs/HACKATHON-REMAINING-TASKS.md`](HACKATHON-REMAINING-TASKS.md) |
| Blog post (bonus prize) | `https://john.ceo/articles/building-persistent-memory-with-qwen` |
| Working demo | https://www.youtube.com/watch?v=ZxXKvVY6iMQ (~2:31; architecture, Alibaba, live MCP verify) |
| Test access | Public HTTPS URL + Bearer token in testing instructions |
| Description | Features: write, search, recall, forget; Qwen salience; RDS persistence |

### Judge testing instructions

Copy from [`JUDGE-TESTING.md`](JUDGE-TESTING.md) into Devpost field 16.

```text
Repository: https://github.com/John-CEO-HQ/qwen-memory-mcp
Demo video: https://www.youtube.com/watch?v=ZxXKvVY6iMQ
Live demo: https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run/health
Blog post: https://john.ceo/articles/building-persistent-memory-with-qwen

Auth: Authorization: Bearer <from Devpost field 16>

Quick test:
  export BASE_URL=https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run
  export MCP_AUTH_TOKEN='<from Devpost>'
  ./scripts/smoke-mcp-http.sh

Or: npm run verify:deployed (DEPLOYED_MCP_URL + MCP_AUTH_TOKEN in .env.integration)
```

Rotate `MCP_AUTH_TOKEN` after the judging period.

---

## Troubleshooting

| Symptom | See |
|---------|-----|
| Wrong npm scripts (parent repo tests run) | [INSTALL.md](INSTALL.md) - npm prefix workaround |
| DashScope 401/403 | [CREDENTIALS-AND-SETUP.md](CREDENTIALS-AND-SETUP.md) - region URL |
| Integration tests all skipped | Set `QWEN_API_KEY` in `.env` |
| Deploy verify fails 401 | Match `MCP_AUTH_TOKEN` locally and on server |
| MySQL connection refused | RDS security group, VPC, credentials |

---

## Related docs

- [CREDENTIALS-AND-SETUP.md](CREDENTIALS-AND-SETUP.md)
- [PHASE1-REMOTE-INTEGRATION.md](PHASE1-REMOTE-INTEGRATION.md)
- [PHASE2-DEPLOYMENT-TESTING.md](PHASE2-DEPLOYMENT-TESTING.md)
- [INSTALL.md](INSTALL.md)
- [JUDGE-TESTING.md](JUDGE-TESTING.md)
- [HACKATHON-REMAINING-TASKS.md](HACKATHON-REMAINING-TASKS.md)
