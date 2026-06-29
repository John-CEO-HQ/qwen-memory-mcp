/**
 * Core domain types for the Qwen Memory MCP server.
 *
 * A "memory" is a single durable fact, preference, or event extracted from a
 * conversation. Memories are namespaced per `userId` so one server instance can
 * serve many agents/users without leaking state between them.
 */

export type MemoryKind = "preference" | "fact" | "event" | "task" | "other";

export type MemoryStatus = "active" | "archived" | "forgotten";

export interface Memory {
  id: string;
  userId: string;
  /** The verbatim content the agent asked to remember. */
  content: string;
  /** A short, token-cheap restatement (used when packing limited context). */
  summary: string;
  tags: string[];
  kind: MemoryKind;
  /** Importance in [0,1] as judged by the intelligence layer. */
  salience: number;
  /** Embedding vector for semantic retrieval. */
  embedding: number[];
  createdAt: number;
  lastAccessedAt: number;
  /** Reinforcement signal: how many times this memory was recalled. */
  accessCount: number;
  status: MemoryStatus;
  /** When this memory was merged into a consolidated one, its id. */
  supersededBy: string | null;
  /** Optional originating session id, for cross-session analytics. */
  sourceSession: string | null;
}

/** Result of the intelligence layer analyzing a single new memory. */
export interface MemoryAnalysis {
  summary: string;
  tags: string[];
  salience: number;
  kind: MemoryKind;
}

/** Result of consolidating a cluster of related memories into one. */
export interface ConsolidationResult {
  summary: string;
  tags: string[];
  salience: number;
  kind: MemoryKind;
  /**
   * Ids of memories in the cluster that are now outdated/contradicted and
   * should be forgotten rather than merely archived behind the consolidation.
   */
  outdatedIds: string[];
}

/**
 * The pluggable "brain" of the memory system. One implementation talks to Qwen
 * on Alibaba Cloud; another is a deterministic offline fake for tests/demos.
 */
export interface MemoryIntelligence {
  /** Returns one embedding vector per input text (same order). */
  embed(texts: string[]): Promise<number[][]>;
  /** Extracts summary/tags/salience/kind for a single new memory. */
  analyze(content: string): Promise<MemoryAnalysis>;
  /** Merges a related cluster of memories and flags outdated members. */
  consolidate(
    cluster: Pick<Memory, "id" | "content" | "createdAt">[],
  ): Promise<ConsolidationResult>;
  /** Human-readable label, surfaced in logs/health. */
  readonly label: string;
}

export interface RankedMemory {
  memory: Memory;
  similarity: number;
  /** Combined score used for ranking (similarity + salience + recency). */
  score: number;
}

export interface ForgettingReport {
  userId: string;
  scanned: number;
  consolidatedClusters: number;
  consolidatedInto: number;
  archived: number;
  forgotten: number;
  retained: number;
}
