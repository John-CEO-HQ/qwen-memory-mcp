import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { FakeIntelligence } from "../src/fake-intelligence.js";
import { FileMemoryStore } from "../src/memory/file-store.js";
import { MemoryService } from "../src/memory/service.js";
import { clusterBySimilarity, retentionScore } from "../src/memory/forgetting.js";
import { fakeEmbed } from "../src/fake-intelligence.js";
import type { Memory } from "../src/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function testConfig() {
  return loadConfig({
    USE_FAKE_QWEN: "1",
    MEMORY_STORE: "memory",
    MEMORY_CONSOLIDATE_SIMILARITY: "0.6",
    MEMORY_DECAY_HALF_LIFE_DAYS: "7",
    MEMORY_RETENTION_THRESHOLD: "0.3",
    MEMORY_SALIENCE_FLOOR: "0.8",
  });
}

function build() {
  const cfg = testConfig();
  const store = new FileMemoryStore(null);
  const service = new MemoryService(store, new FakeIntelligence(), cfg);
  return { cfg, store, service };
}

describe("retentionScore", () => {
  it("decays with age and is reinforced by access", () => {
    const cfg = testConfig().forgetting;
    const now = Date.now();
    const base = {
      id: "x",
      userId: "u",
      content: "c",
      summary: "c",
      tags: [] as string[],
      kind: "fact" as const,
      salience: 0.6,
      embedding: [] as number[],
      createdAt: now,
      status: "active" as const,
      supersededBy: null,
      sourceSession: null,
    };
    const fresh: Memory = { ...base, lastAccessedAt: now, accessCount: 0 };
    const old: Memory = { ...base, lastAccessedAt: now - 30 * DAY_MS, accessCount: 0 };
    const oldButUsed: Memory = { ...base, lastAccessedAt: now - 30 * DAY_MS, accessCount: 20 };
    expect(retentionScore(fresh, now, cfg)).toBeGreaterThan(retentionScore(old, now, cfg));
    expect(retentionScore(oldButUsed, now, cfg)).toBeGreaterThan(retentionScore(old, now, cfg));
  });
});

describe("clusterBySimilarity", () => {
  it("groups near-duplicates and separates unrelated memories", () => {
    const mk = (id: string, content: string): Memory => ({
      id,
      userId: "u",
      content,
      summary: content,
      tags: [],
      kind: "fact",
      salience: 0.5,
      embedding: fakeEmbed(content),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      status: "active",
      supersededBy: null,
      sourceSession: null,
    });
    const clusters = clusterBySimilarity(
      [
        mk("a", "afternoon meetings after 2pm are best for scheduling"),
        mk("b", "I prefer afternoon meetings after 2pm for scheduling"),
        mk("c", "the office cat enjoys sleeping on warm laptops"),
      ],
      0.6,
    );
    const sizes = clusters.map((c) => c.length).sort();
    expect(sizes).toContain(2);
    expect(clusters.length).toBe(2);
  });
});

describe("runForgetting (via service)", () => {
  it("consolidates near-duplicate memories into one active memory", async () => {
    const { service, store } = build();
    await service.write({
      userId: "u1",
      content: "afternoon meetings after 2pm are best for scheduling",
    });
    await service.write({
      userId: "u1",
      content: "I prefer afternoon meetings after 2pm for scheduling",
    });
    const report = await service.forget("u1");
    expect(report.consolidatedClusters).toBeGreaterThanOrEqual(1);

    const active = (await store.listAll("u1")).filter((m) => m.status === "active");
    expect(active.length).toBe(1);
    expect(active[0]?.supersededBy).toBeNull();
  });

  it("forgets stale low-salience memories but keeps high-salience ones", async () => {
    const { service, store } = build();
    const now = Date.now();

    const low = await service.write({
      userId: "u1",
      content: "we grabbed coffee near the office once",
      salience: 0.3,
    });
    const high = await service.write({
      userId: "u1",
      content: "user is allergic to peanuts and this is critical",
      salience: 0.95,
    });
    // Age both well beyond the half-life so decay dominates.
    await store.update("u1", low.id, { lastAccessedAt: now - 60 * DAY_MS });
    await store.update("u1", high.id, { lastAccessedAt: now - 60 * DAY_MS });

    const report = await service.forget("u1", now);
    expect(report.forgotten).toBeGreaterThanOrEqual(1);

    const lowAfter = await store.get("u1", low.id);
    const highAfter = await store.get("u1", high.id);
    expect(lowAfter?.status).toBe("forgotten");
    expect(highAfter?.status).toBe("active");
  });
});
