import type { Memory } from "../types.js";

/**
 * Persistence boundary for memories. Implementations must namespace strictly by
 * `userId` so a single deployment can host many agents without cross-talk.
 *
 * Retrieval here is intentionally "load active rows, score in app". At hackathon
 * scale that is simpler and fully portable; the MySQL store documents how to
 * graduate to a native vector index (AnalyticDB-PG) later.
 */
export interface MemoryStore {
  /** Insert a new memory. */
  put(memory: Memory): Promise<void>;
  /** Apply a partial update to an existing memory. */
  update(userId: string, id: string, patch: Partial<Memory>): Promise<void>;
  get(userId: string, id: string): Promise<Memory | null>;
  /** All memories with status === "active" for a user. */
  listActive(userId: string): Promise<Memory[]>;
  /** Every memory for a user, any status (analytics/debugging). */
  listAll(userId: string): Promise<Memory[]>;
  /** Hard-delete. Forgetting normally uses status changes, not deletion. */
  remove(userId: string, id: string): Promise<void>;
  close(): Promise<void>;
}
