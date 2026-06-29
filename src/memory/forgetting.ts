import type { ForgettingConfig } from "../config.js";
import { cosineSimilarity } from "../util/similarity.js";
import { newId } from "../util/id.js";
import type {
  ForgettingReport,
  Memory,
  MemoryIntelligence,
} from "../types.js";
import type { MemoryStore } from "./store.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Decayed retention score in (0,1]. Importance (salience) decays exponentially
 * with time since last access (a half-life model), then is reinforced by how
 * often the memory has actually been recalled. A memory that is never used
 * fades; a frequently recalled or highly salient one persists.
 */
export function retentionScore(
  memory: Memory,
  now: number,
  cfg: ForgettingConfig,
): number {
  const ageDays = Math.max(0, (now - memory.lastAccessedAt) / DAY_MS);
  const halfLife = Math.max(0.5, cfg.decayHalfLifeDays);
  const decay = Math.pow(0.5, ageDays / halfLife);
  const reinforcement = 1 + Math.log1p(Math.max(0, memory.accessCount)) / 4;
  return Math.min(1, memory.salience * decay * reinforcement);
}

/**
 * Greedy single-link clustering by embedding cosine similarity. Each memory
 * joins the first existing cluster whose seed is similar enough; otherwise it
 * starts a new cluster. Order-stable and dependency-free.
 */
export function clusterBySimilarity(
  memories: Memory[],
  threshold: number,
): Memory[][] {
  const clusters: Memory[][] = [];
  for (const memory of memories) {
    let placed = false;
    for (const cluster of clusters) {
      const seed = cluster[0];
      if (seed && cosineSimilarity(seed.embedding, memory.embedding) >= threshold) {
        cluster.push(memory);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([memory]);
  }
  return clusters;
}

/**
 * The forgetting pass. Two mechanisms run in order:
 *
 *  1. Consolidation: clusters of near-duplicate/related memories are merged by
 *     the intelligence layer into one canonical memory. Members are archived
 *     (kept for history, hidden from recall); members the model flags as
 *     outdated/contradicted are marked "forgotten".
 *
 *  2. Decay pruning: remaining memories whose retention score has fallen below
 *     the threshold - and that are not above the salience floor - are forgotten.
 *
 * Returns a structured report so callers (and the demo) can show what happened.
 */
export async function runForgetting(
  store: MemoryStore,
  intelligence: MemoryIntelligence,
  userId: string,
  cfg: ForgettingConfig,
  now: number = Date.now(),
): Promise<ForgettingReport> {
  const active = await store.listActive(userId);
  const report: ForgettingReport = {
    userId,
    scanned: active.length,
    consolidatedClusters: 0,
    consolidatedInto: 0,
    archived: 0,
    forgotten: 0,
    retained: 0,
  };

  const consumed = new Set<string>();

  // --- 1. Consolidation -----------------------------------------------------
  const clusters = clusterBySimilarity(active, cfg.consolidateSimilarity);
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    const result = await intelligence.consolidate(
      cluster.map((m) => ({ id: m.id, content: m.content, createdAt: m.createdAt })),
    );
    const [embedding] = await intelligence.embed([result.summary]);

    const consolidatedId = newId("mem");
    const consolidated: Memory = {
      id: consolidatedId,
      userId,
      content: result.summary,
      summary: result.summary,
      tags: result.tags,
      kind: result.kind,
      salience: result.salience,
      embedding: embedding ?? [],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: cluster.reduce((sum, m) => sum + m.accessCount, 0),
      status: "active",
      supersededBy: null,
      sourceSession: null,
    };
    await store.put(consolidated);
    report.consolidatedClusters += 1;
    report.consolidatedInto += 1;

    const outdated = new Set(result.outdatedIds);
    for (const member of cluster) {
      consumed.add(member.id);
      await store.update(userId, member.id, {
        status: outdated.has(member.id) ? "forgotten" : "archived",
        supersededBy: consolidatedId,
      });
      if (outdated.has(member.id)) report.forgotten += 1;
      else report.archived += 1;
    }
  }

  // --- 2. Decay pruning -----------------------------------------------------
  for (const memory of active) {
    if (consumed.has(memory.id)) continue;
    const score = retentionScore(memory, now, cfg);
    const keep = score >= cfg.retentionThreshold || memory.salience >= cfg.salienceFloor;
    if (keep) {
      report.retained += 1;
    } else {
      await store.update(userId, memory.id, { status: "forgotten" });
      report.forgotten += 1;
    }
  }

  return report;
}
