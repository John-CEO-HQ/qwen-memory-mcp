import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { FakeIntelligence } from "../src/fake-intelligence.js";
import { FileMemoryStore } from "../src/memory/file-store.js";
import { MemoryService } from "../src/memory/service.js";

function makeService() {
  const cfg = loadConfig({ USE_FAKE_QWEN: "1", MEMORY_STORE: "memory" });
  return new MemoryService(new FileMemoryStore(null), new FakeIntelligence(), cfg);
}

describe("MemoryService", () => {
  it("writes a memory with derived metadata", async () => {
    const svc = makeService();
    const m = await svc.write({
      userId: "u1",
      content: "I always prefer morning meetings before 11am.",
    });
    expect(m.id).toMatch(/^mem_/);
    expect(m.kind).toBe("preference");
    expect(m.salience).toBeGreaterThan(0.5);
    expect(m.embedding.length).toBeGreaterThan(0);
  });

  it("namespaces memories per user", async () => {
    const svc = makeService();
    await svc.write({ userId: "u1", content: "u1 secret fact about logistics" });
    await svc.write({ userId: "u2", content: "u2 unrelated fact about cooking" });
    const r1 = await svc.search({ userId: "u1", query: "logistics", k: 10 });
    expect(r1.every((r) => r.memory.userId === "u1")).toBe(true);
  });

  it("recall respects the token budget", async () => {
    const svc = makeService();
    for (let i = 0; i < 10; i++) {
      await svc.write({ userId: "u1", content: `fact ${i} about scheduling and meetings` });
    }
    const recall = await svc.recallContext({
      userId: "u1",
      query: "scheduling meetings",
      tokenBudget: 25,
    });
    expect(recall.usedTokens).toBeLessThanOrEqual(25);
    expect(recall.included.length).toBeGreaterThan(0);
  });

  it("reinforces recalled memories (access count grows)", async () => {
    const svc = makeService();
    const written = await svc.write({ userId: "u1", content: "deadline for the report is friday" });
    await svc.search({ userId: "u1", query: "report deadline", k: 5 });
    const after = await svc.search({ userId: "u1", query: "report deadline", k: 5 });
    const found = after.find((r) => r.memory.id === written.id);
    expect(found?.memory.accessCount).toBeGreaterThanOrEqual(1);
  });
});
