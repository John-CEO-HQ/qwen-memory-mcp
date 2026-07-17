# AGENTS.md - qwen-memory-mcp

## What this is

`qwen-memory-mcp` is a self-contained, open-source MCP server that provides
long-term memory for AI agents, powered by Qwen on Alibaba Cloud. It is a
hackathon submission (Track 1 - MemoryAgent) under the MIT license.

**Public repository:** https://github.com/John-CEO-HQ/qwen-memory-mcp

## Isolation contract

This project is developed as a **standalone repository**. It must not import
from or depend on any private monorepo.

**Hard requirements:**

1. **No outward dependencies.** Nothing in this folder may import from,
   reference, or read files outside this repository. No `../` imports that escape
   the repo, no reliance on a parent `package.json`, `tsconfig`, `node_modules`,
   env, database, or build tooling. This module has its own `package.json`,
   `tsconfig.json`, and `vitest.config.ts`.

2. **Self-contained tooling.** Build, typecheck, test, lint, run, and deploy
   must all work from the repository root alone (`npm install` + scripts in
   `package.json`).

3. **No secrets in git.** The Qwen API key and auth tokens are env vars only
   and must never be committed.

## Commands

Operator docs live in [`docs/`](docs/):

- [docs/TESTING-GUIDE.md](docs/TESTING-GUIDE.md) - master testing index
- [docs/JUDGE-TESTING.md](docs/JUDGE-TESTING.md) - hackathon judge instructions
- [docs/CREDENTIALS-AND-SETUP.md](docs/CREDENTIALS-AND-SETUP.md) - accounts and API keys
- [docs/PHASE1-REMOTE-INTEGRATION.md](docs/PHASE1-REMOTE-INTEGRATION.md) - live Qwen tests
- [docs/PHASE2-DEPLOYMENT-TESTING.md](docs/PHASE2-DEPLOYMENT-TESTING.md) - Alibaba deploy verify
- [docs/INSTALL.md](docs/INSTALL.md) - install, run, deploy on Alibaba Cloud

```bash
npm install        # install module-local dependencies
npm run demo       # offline multi-session memory demo (no API key needed)
npm test           # vitest suite (offline unit tests; integration tests skip without keys)
npm run test:integration  # live Qwen / deploy tests (needs env; see TESTING-GUIDE)
npm run verify:qwen       # Phase 1 DashScope ping
npm run verify:deployed   # Phase 2 deployed URL smoke
npm run demo:live         # demo/cli.ts against real Qwen
npm run typecheck  # tsc --noEmit
npm run build      # compile to dist/
npm start          # run the server (stdio by default; MCP_TRANSPORT=http for HTTP)
```

## Conventions

- TypeScript, ESM, NodeNext module resolution: relative imports use explicit
  `.js` extensions.
- ASCII-only in source and docs (no smart quotes, em dashes, or ellipsis chars).
- The Qwen/Alibaba Cloud integration is intentionally confined to
  `src/qwen.ts` and `src/memory/mysql-store.ts`.
- Keep the offline `FakeIntelligence` behavior in lockstep with the
  `MemoryIntelligence` interface so tests and the demo never need network.
