#!/usr/bin/env node
/**
 * Entry point. Loads config, wires the store + Qwen intelligence into a
 * MemoryService, and starts the requested transport (stdio or HTTP).
 */

import { loadConfig } from "./config.js";
import { createIntelligence } from "./intelligence.js";
import { createStore } from "./memory/create-store.js";
import { MemoryService } from "./memory/service.js";
import { startHttp } from "./transports/http.js";
import { startStdio } from "./transports/stdio.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const store = await createStore(cfg);
  const intelligence = createIntelligence(cfg);
  const service = new MemoryService(store, intelligence, cfg);

  const shutdown = async () => {
    await service.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  if (cfg.transport === "http") {
    await startHttp(service, cfg);
  } else {
    await startStdio(service);
  }
}

main().catch((err) => {
  console.error("[qwen-memory-mcp] fatal:", err);
  process.exit(1);
});
