import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Memory } from "../types.js";
import type { MemoryStore } from "./store.js";

/**
 * Zero-dependency store backed by a single JSON file (or pure in-memory when no
 * path is given). Writes are serialized and persisted atomically via a temp
 * file + rename. Ideal for local runs, the demo, and CI; not meant for high
 * concurrency (use the MySQL store on Alibaba Cloud for that).
 */
export class FileMemoryStore implements MemoryStore {
  private readonly path: string | null;
  /** userId -> (memoryId -> Memory) */
  private readonly data = new Map<string, Map<string, Memory>>();
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(path: string | null) {
    this.path = path;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.path) return;
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Record<string, Memory[]>;
      for (const [userId, memories] of Object.entries(parsed)) {
        const inner = new Map<string, Memory>();
        for (const m of memories) inner.set(m.id, m);
        this.data.set(userId, inner);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      // No file yet: start empty.
    }
  }

  private persist(): Promise<void> {
    if (!this.path) return Promise.resolve();
    const path = this.path;
    const snapshot: Record<string, Memory[]> = {};
    for (const [userId, inner] of this.data) snapshot[userId] = [...inner.values()];
    // Chain writes so concurrent mutations never interleave on disk.
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
      await rename(tmp, path);
    });
    return this.writeChain;
  }

  private bucket(userId: string): Map<string, Memory> {
    let inner = this.data.get(userId);
    if (!inner) {
      inner = new Map<string, Memory>();
      this.data.set(userId, inner);
    }
    return inner;
  }

  async put(memory: Memory): Promise<void> {
    await this.ensureLoaded();
    this.bucket(memory.userId).set(memory.id, { ...memory });
    await this.persist();
  }

  async update(userId: string, id: string, patch: Partial<Memory>): Promise<void> {
    await this.ensureLoaded();
    const inner = this.bucket(userId);
    const existing = inner.get(id);
    if (!existing) return;
    inner.set(id, { ...existing, ...patch, id, userId });
    await this.persist();
  }

  async get(userId: string, id: string): Promise<Memory | null> {
    await this.ensureLoaded();
    return this.data.get(userId)?.get(id) ?? null;
  }

  async listActive(userId: string): Promise<Memory[]> {
    await this.ensureLoaded();
    return [...(this.data.get(userId)?.values() ?? [])].filter((m) => m.status === "active");
  }

  async listAll(userId: string): Promise<Memory[]> {
    await this.ensureLoaded();
    return [...(this.data.get(userId)?.values() ?? [])];
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.ensureLoaded();
    this.data.get(userId)?.delete(id);
    await this.persist();
  }

  async close(): Promise<void> {
    await this.writeChain;
  }
}
