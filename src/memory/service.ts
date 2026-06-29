import type { Config } from "../config.js";
import { newId } from "../util/id.js";
import { runForgetting } from "./forgetting.js";
import {
  DEFAULT_WEIGHTS,
  packContext,
  rankMemories,
  type PackedContext,
} from "./ranking.js";
import type { MemoryStore } from "./store.js";
import type {
  ForgettingReport,
  Memory,
  MemoryIntelligence,
  RankedMemory,
} from "../types.js";

export interface WriteInput {
  userId: string;
  content: string;
  sourceSession?: string | null;
  /** Optional caller-provided importance override in [0,1]. */
  salience?: number;
}

export interface SearchInput {
  userId: string;
  query: string;
  k?: number;
}

export interface RecallInput {
  userId: string;
  query: string;
  tokenBudget: number;
  k?: number;
}

export interface RecallResult extends PackedContext {
  query: string;
}

/**
 * Orchestrates the store and the intelligence layer into the four operations
 * exposed as MCP tools: write, search, recall-context, and forget.
 */
export class MemoryService {
  constructor(
    private readonly store: MemoryStore,
    private readonly intelligence: MemoryIntelligence,
    private readonly cfg: Config,
  ) {}

  get intelligenceLabel(): string {
    return this.intelligence.label;
  }

  async write(input: WriteInput): Promise<Memory> {
    const analysis = await this.intelligence.analyze(input.content);
    const [embedding] = await this.intelligence.embed([input.content]);
    const now = Date.now();
    const memory: Memory = {
      id: newId("mem"),
      userId: input.userId,
      content: input.content,
      summary: analysis.summary,
      tags: analysis.tags,
      kind: analysis.kind,
      salience:
        typeof input.salience === "number"
          ? Math.min(1, Math.max(0, input.salience))
          : analysis.salience,
      embedding: embedding ?? [],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      status: "active",
      supersededBy: null,
      sourceSession: input.sourceSession ?? null,
    };
    await this.store.put(memory);
    return memory;
  }

  async search(input: SearchInput): Promise<RankedMemory[]> {
    const k = input.k ?? 5;
    const [queryEmbedding] = await this.intelligence.embed([input.query]);
    const memories = await this.store.listActive(input.userId);
    const ranked = rankMemories(queryEmbedding ?? [], memories, Date.now(), DEFAULT_WEIGHTS).slice(
      0,
      k,
    );
    await this.reinforce(input.userId, ranked);
    return ranked;
  }

  async recallContext(input: RecallInput): Promise<RecallResult> {
    const k = input.k ?? 24;
    const [queryEmbedding] = await this.intelligence.embed([input.query]);
    const memories = await this.store.listActive(input.userId);
    const ranked = rankMemories(queryEmbedding ?? [], memories, Date.now(), DEFAULT_WEIGHTS).slice(
      0,
      k,
    );
    const packed = packContext(ranked, input.tokenBudget);
    await this.reinforce(input.userId, packed.included);
    return { ...packed, query: input.query };
  }

  async forget(userId: string, now: number = Date.now()): Promise<ForgettingReport> {
    return runForgetting(this.store, this.intelligence, userId, this.cfg.forgetting, now);
  }

  /** Reinforcement: recalled memories get a recency bump and access increment. */
  private async reinforce(userId: string, items: RankedMemory[]): Promise<void> {
    const now = Date.now();
    await Promise.all(
      items.map((item) =>
        this.store.update(userId, item.memory.id, {
          lastAccessedAt: now,
          accessCount: item.memory.accessCount + 1,
        }),
      ),
    );
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
