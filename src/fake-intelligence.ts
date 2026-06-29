/**
 * Deterministic, offline implementation of MemoryIntelligence.
 *
 * It needs no network and no API key, so the demo and the test suite run
 * anywhere. It is intentionally simple but good enough to exercise the full
 * pipeline (embedding -> retrieval -> clustering -> consolidation -> forgetting):
 *
 *   - embed(): hashed bag-of-words into a fixed-dim vector, so texts that share
 *     vocabulary land close together under cosine similarity.
 *   - analyze(): keyword heuristics for salience/kind/tags.
 *   - consolidate(): keeps the newest item canonical and flags older items that
 *     look superseded (same subject, "update" cues) as outdated.
 */

import type {
  ConsolidationResult,
  Memory,
  MemoryAnalysis,
  MemoryIntelligence,
  MemoryKind,
} from "./types.js";

// Feature-hashing embedding. Each token is hashed into HASHES distinct buckets
// of a DIM-wide vector. A genuinely shared token lights up HASHES aligned
// buckets in both vectors, so real lexical overlap dominates the occasional
// random hash collision - keeping unrelated texts near-orthogonal.
const DIM = 2048;
const HASHES = 4;

const HIGH_SALIENCE_CUES = [
  "always",
  "never",
  "prefer",
  "favorite",
  "favourite",
  "deadline",
  "important",
  "must",
  "allerg",
  "birthday",
  "password",
  "remember",
];

const PREFERENCE_CUES = ["prefer", "like", "love", "hate", "favorite", "favourite", "always", "never"];
const TASK_CUES = ["todo", "task", "remind", "schedule", "deadline", "follow up", "follow-up"];
const EVENT_CUES = ["yesterday", "today", "tomorrow", "met", "happened", "went", "on monday", "last week"];

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hashToken(token: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function fakeEmbed(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = tokenize(text);
  for (const t of tokens) {
    for (let s = 0; s < HASHES; s++) {
      const idx = hashToken(t, s) % DIM;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
  }
  return vec;
}

export class FakeIntelligence implements MemoryIntelligence {
  readonly label = "fake(offline-deterministic)";

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(fakeEmbed);
  }

  async analyze(content: string): Promise<MemoryAnalysis> {
    const lower = content.toLowerCase();
    const tokens = tokenize(content);
    const cueHits = HIGH_SALIENCE_CUES.filter((c) => lower.includes(c)).length;
    const lengthBoost = Math.min(0.2, tokens.length / 100);
    const salience = Math.min(1, 0.45 + cueHits * 0.18 + lengthBoost);

    let kind: MemoryKind = "fact";
    if (PREFERENCE_CUES.some((c) => lower.includes(c))) kind = "preference";
    else if (TASK_CUES.some((c) => lower.includes(c))) kind = "task";
    else if (EVENT_CUES.some((c) => lower.includes(c))) kind = "event";

    const stop = new Set([
      "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for",
      "is", "are", "was", "were", "i", "my", "me", "you", "it", "that", "this",
      "with", "at", "be", "do", "does", "have", "has",
    ]);
    const tags = Array.from(new Set(tokens.filter((t) => t.length > 2 && !stop.has(t)))).slice(0, 5);

    const summary = content.length <= 140 ? content : `${content.slice(0, 137)}...`;
    return { summary, tags, salience, kind };
  }

  async consolidate(
    cluster: Pick<Memory, "id" | "content" | "createdAt">[],
  ): Promise<ConsolidationResult> {
    const sorted = [...cluster].sort((a, b) => a.createdAt - b.createdAt);
    const newest = sorted[sorted.length - 1];
    const newestContent = newest?.content ?? "";
    const analysis = await this.analyze(newestContent);

    // Older items that share the dominant subject token with the newest item
    // are treated as superseded (the newest statement wins).
    const newestTokens = new Set(tokenize(newestContent));
    const outdatedIds = sorted
      .slice(0, -1)
      .filter((m) => {
        const overlap = tokenize(m.content).filter((t) => newestTokens.has(t)).length;
        return overlap >= 2;
      })
      .map((m) => m.id);

    return {
      summary: analysis.summary,
      tags: analysis.tags,
      salience: Math.max(analysis.salience, 0.6),
      kind: analysis.kind,
      outdatedIds,
    };
  }
}
