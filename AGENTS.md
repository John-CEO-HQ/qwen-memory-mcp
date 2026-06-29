# AGENTS.md - qwen-memory-mcp

## What this is

`qwen-memory-mcp` is a self-contained, open-source MCP server that provides
long-term memory for AI agents, powered by Qwen on Alibaba Cloud. It is a
hackathon submission (Track 1 - MemoryAgent) under the MIT license.

## IMPORTANT: isolation contract (read before editing)

This folder currently lives inside a larger private monorepo **only for
convenience**. It is developed as if it were already its own repository.

**In the future this folder will be split out into its own standalone public
git repository.** To keep that split trivial and to keep the private codebase
defendably separate from this open-source module, the following rules are
**hard requirements**:

1. **No outward dependencies.** Nothing in `qwen-memory-mcp/` may import from,
   reference, or read files outside this folder. No `../` imports that escape
   the folder, no reliance on the parent repo's `package.json`, `tsconfig`,
   `node_modules`, env, database, or build tooling. This module has its own
   `package.json`, `tsconfig.json`, and `vitest.config.ts`.

2. **No inward dependencies.** Nothing in the parent repository may import from,
   build, test, or otherwise depend on this folder. The parent's `tsc -b`
   project references, vitest `include` globs, and ESLint config all exclude
   this folder so the two never couple.

3. **Self-contained tooling.** Build, typecheck, test, lint, run, and deploy
   must all work from within this folder alone (`npm install` + the scripts in
   `package.json`).

4. **No secrets, no private context.** Never copy proprietary code, internal
   docs, credentials, or customer data from the parent repo into this folder.
   The Qwen API key and any auth tokens are backend-only env vars and must never
   be committed.

If you need behavior that today lives in the parent repo, **re-implement a
minimal version here** rather than importing it.

## How to split this out later

1. `git subtree split --prefix=qwen-memory-mcp -b qwen-memory-mcp-export`
   (or copy the folder into a fresh repo).
2. Push to a new public repository; add the MIT `LICENSE` (already present).
3. Remove this folder from the parent and any parent-side exclusions referencing
   it. No code changes inside the module should be required, because of the
   isolation contract above.

## Commands

Operator docs live in [`docs/`](docs/):

- [docs/INSTALL.md](docs/INSTALL.md) - install, run, deploy on Alibaba Cloud
- [docs/JOHN-CEO-INTEGRATION.md](docs/JOHN-CEO-INTEGRATION.md) - John CEO wiring blueprint

```bash
npm install        # install module-local dependencies
npm run demo       # offline multi-session memory demo (no API key needed)
npm test           # vitest suite (offline, deterministic)
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
