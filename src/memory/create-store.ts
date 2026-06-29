import type { Config } from "../config.js";
import { FileMemoryStore } from "./file-store.js";
import { MysqlMemoryStore } from "./mysql-store.js";
import type { MemoryStore } from "./store.js";

/** Builds the configured store and runs any one-time setup (schema creation). */
export async function createStore(cfg: Config): Promise<MemoryStore> {
  switch (cfg.store) {
    case "memory":
      return new FileMemoryStore(null);
    case "mysql": {
      const store = new MysqlMemoryStore(cfg.mysql);
      await store.ensureSchema();
      return store;
    }
    case "file":
    default:
      return new FileMemoryStore(cfg.fileStorePath);
  }
}
