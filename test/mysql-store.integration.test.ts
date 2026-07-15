import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { MysqlMemoryStore } from "../src/memory/mysql-store.js";
import { newId } from "../src/util/id.js";
import type { Memory } from "../src/types.js";
import { hasMysql } from "./helpers/integration-env.js";

describe.skipIf(!hasMysql())("MysqlMemoryStore (integration)", () => {
  const cfg = loadConfig(process.env);

  function makeMemory(userId: string, content: string): Memory {
    const now = Date.now();
    return {
      id: newId("mem"),
      userId,
      content,
      summary: content.slice(0, 80),
      tags: ["integration"],
      kind: "fact",
      salience: 0.7,
      embedding: [0.1, 0.2, 0.3],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      status: "active",
      supersededBy: null,
      sourceSession: null,
    };
  }

  it("creates schema, stores, lists, and updates memories", async () => {
    const store = new MysqlMemoryStore(cfg.mysql);
    await store.ensureSchema();

    const userId = `mysql-int-${Date.now()}`;
    const mem = makeMemory(userId, "integration mysql store test fact");
    await store.put(mem);

    const listed = await store.listActive(userId);
    expect(listed.some((m) => m.id === mem.id)).toBe(true);

    await store.update(userId, mem.id, { accessCount: 1 });
    const listed2 = await store.listActive(userId);
    const updated = listed2.find((m) => m.id === mem.id);
    expect(updated?.accessCount).toBe(1);

    await store.close();
  });
});
