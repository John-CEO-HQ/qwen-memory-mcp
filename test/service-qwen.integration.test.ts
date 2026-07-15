import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { createIntelligence } from "../src/intelligence.js";
import { FileMemoryStore } from "../src/memory/file-store.js";
import { MemoryService } from "../src/memory/service.js";
import { hasQwenKey, integrationUserId } from "./helpers/integration-env.js";

describe.skipIf(!hasQwenKey())("MemoryService (remote Qwen)", () => {
  const userId = integrationUserId();

  function makeService() {
    const cfg = loadConfig({
      ...process.env,
      USE_FAKE_QWEN: "",
      MEMORY_STORE: "memory",
    });
    return new MemoryService(new FileMemoryStore(null), createIntelligence(cfg), cfg);
  }

  it("write, search, recall, forget lifecycle", async () => {
    const svc = makeService();
    const unique = `integration-${Date.now()}`;
    const content = `${unique}: I am vegetarian; never suggest steakhouses.`;

    const written = await svc.write({ userId, content });
    expect(written.id).toMatch(/^mem_/);
    expect(written.embedding.length).toBeGreaterThan(0);

    const search = await svc.search({ userId, query: "dietary restrictions vegetarian", k: 5 });
    expect(search.some((r) => r.memory.id === written.id)).toBe(true);

    const recall = await svc.recallContext({
      userId,
      query: "food preferences",
      tokenBudget: 256,
    });
    expect(recall.included.length).toBeGreaterThan(0);
    expect(recall.usedTokens).toBeLessThanOrEqual(256);

    const forget = await svc.forget(userId);
    expect(forget).toBeDefined();
  });
});
