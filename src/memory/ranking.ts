import { cosineSimilarity } from "../util/similarity.js";
import { estimateTokens } from "../util/tokens.js";
import type { Memory, RankedMemory } from "../types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RankWeights {
  similarity: number;
  salience: number;
  recency: number;
  reinforcement: number;
}

export const DEFAULT_WEIGHTS: RankWeights = {
  similarity: 0.6,
  salience: 0.22,
  recency: 0.12,
  reinforcement: 0.06,
};

/** Recency in [0,1]: 1.0 today, decaying with a ~30 day soft horizon. */
export function recencyScore(lastAccessedAt: number, now: number): number {
  const ageDays = Math.max(0, (now - lastAccessedAt) / DAY_MS);
  return 1 / (1 + ageDays / 30);
}

/** Reinforcement in [0,1): grows with access count, saturating. */
export function reinforcementScore(accessCount: number): number {
  return Math.log1p(Math.max(0, accessCount)) / Math.log1p(50);
}

/**
 * Ranks memories for a query embedding by a weighted blend of semantic
 * similarity, intrinsic salience, recency, and recall reinforcement. Pure and
 * deterministic given its inputs, so it is unit-testable without any I/O.
 */
export function rankMemories(
  queryEmbedding: number[],
  memories: Memory[],
  now: number,
  weights: RankWeights = DEFAULT_WEIGHTS,
): RankedMemory[] {
  const ranked = memories.map<RankedMemory>((memory) => {
    const similarity = cosineSimilarity(queryEmbedding, memory.embedding);
    const score =
      weights.similarity * Math.max(0, similarity) +
      weights.salience * memory.salience +
      weights.recency * recencyScore(memory.lastAccessedAt, now) +
      weights.reinforcement * reinforcementScore(memory.accessCount);
    return { memory, similarity, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export interface PackedContext {
  /** Rendered context block, ready to drop into a prompt. */
  context: string;
  /** Memories that were included, in ranked order. */
  included: RankedMemory[];
  usedTokens: number;
}

/**
 * Greedily packs the highest-ranked memories into a token budget, preferring
 * the cheaper `summary` over full `content`. This is the "recall critical
 * memories within a limited context window" requirement of the track.
 */
export function packContext(
  ranked: RankedMemory[],
  tokenBudget: number,
): PackedContext {
  const included: RankedMemory[] = [];
  const lines: string[] = [];
  let used = 0;
  for (const item of ranked) {
    const text = item.memory.summary || item.memory.content;
    const line = `- ${text}`;
    const cost = estimateTokens(line);
    if (used + cost > tokenBudget) {
      // Skip this one but keep trying smaller later items.
      continue;
    }
    included.push(item);
    lines.push(line);
    used += cost;
  }
  return { context: lines.join("\n"), included, usedTokens: used };
}
