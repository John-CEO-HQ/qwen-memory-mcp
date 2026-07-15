import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { QwenIntelligence } from "../src/qwen.js";
import { hasQwenKey } from "./helpers/integration-env.js";

describe.skipIf(!hasQwenKey())("QwenIntelligence (remote)", () => {
  const cfg = loadConfig({ ...process.env, USE_FAKE_QWEN: "" });
  const qwen = new QwenIntelligence(cfg.qwen);

  it("embed returns one vector per input", async () => {
    const vectors = await qwen.embed(["integration test embedding"]);
    expect(vectors).toHaveLength(1);
    const first = vectors[0];
    expect(first).toBeDefined();
    expect(first!.length).toBeGreaterThan(10);
  });

  it("analyze returns summary, tags, salience, kind", async () => {
    const analysis = await qwen.analyze(
      "I always prefer email over phone calls for first contact.",
    );
    expect(analysis.summary.length).toBeGreaterThan(0);
    expect(analysis.tags.length).toBeGreaterThan(0);
    expect(analysis.salience).toBeGreaterThanOrEqual(0);
    expect(analysis.salience).toBeLessThanOrEqual(1);
    expect(["preference", "fact", "event", "task", "other"]).toContain(analysis.kind);
  });

  it("consolidate merges a small cluster", async () => {
    const now = Date.now();
    const result = await qwen.consolidate([
      {
        id: "mem_a",
        content: "User prefers morning meetings before 11am.",
        createdAt: now - 86400000,
      },
      {
        id: "mem_b",
        content: "User prefers morning meetings before 10am now.",
        createdAt: now,
      },
    ]);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.salience).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.outdatedIds)).toBe(true);
  });
});
