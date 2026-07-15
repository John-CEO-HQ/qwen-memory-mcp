/**
 * Standalone, no-network demo of the memory lifecycle across multiple sessions.
 *
 *   npm run demo            # offline deterministic intelligence (default)
 *   QWEN_API_KEY=... USE_FAKE_QWEN= npm run demo   # run against real Qwen
 *
 * It shows, end to end:
 *   1. accumulating memories over two sessions (with Qwen-derived salience/kind);
 *   2. semantic search ranked by relevance + importance + recency;
 *   3. recall packed into a tiny token budget (limited context window);
 *   4. the consolidate-and-forget maintenance pass:
 *        - a near-duplicate instruction is consolidated into one memory and the
 *          older duplicate is forgotten as outdated;
 *        - a stale, low-importance memory decays away once time has passed;
 *        - important and still-fresh memories are retained.
 *
 * The offline intelligence uses a simple lexical embedding, so consolidation is
 * tuned conservatively here. With real Qwen embeddings the same pipeline detects
 * semantic (not just lexical) duplicates and contradictions.
 */

import type { Config } from "../src/config.js";
import { loadConfig } from "../src/config.js";
import { createIntelligence } from "../src/intelligence.js";
import { loadEnvFiles } from "../src/load-env.js";
import { FileMemoryStore } from "../src/memory/file-store.js";
import { MemoryService } from "../src/memory/service.js";

const USER = "demo-user";
const DAY_MS = 24 * 60 * 60 * 1000;

function header(title: string): void {
  console.log(`\n${"=".repeat(64)}\n${title}\n${"=".repeat(64)}`);
}

async function main(): Promise<void> {
  loadEnvFiles();
  // Tune the maintenance pass for a clear offline demonstration.
  const cfg: Config = {
    ...loadConfig(),
    forgetting: {
      decayHalfLifeDays: 3,
      consolidateSimilarity: 0.6,
      retentionThreshold: 0.4,
      salienceFloor: 0.8,
    },
  };
  const store = new FileMemoryStore(null); // pure in-memory for a clean run
  const intelligence = createIntelligence(cfg);
  const service = new MemoryService(store, intelligence, cfg);

  console.log(`Intelligence: ${service.intelligenceLabel}`);

  header("Session 1 - onboarding: preferences and facts");
  const session1 = [
    "I always prefer email over phone calls for first contact.",
    "My company is a B2B logistics startup based in Warsaw.",
    "I am vegetarian; never suggest steakhouses.",
    "We grabbed coffee near the office on Tuesday.", // low value -> will decay
  ];
  let coffeeId = "";
  for (const c of session1) {
    const m = await service.write({ userId: USER, content: c, sourceSession: "s1" });
    if (c.startsWith("We grabbed coffee")) coffeeId = m.id;
    console.log(`  + [${m.kind} sal=${m.salience.toFixed(2)}] ${m.summary}`);
  }

  header("Session 2 - more context + a near-duplicate instruction");
  const session2 = [
    "Our biggest client is in Berlin and renews the contract in Q4.",
    "Please schedule meetings in the afternoon, after 2pm.",
    "Please schedule meetings in the afternoon after 2pm, that works best.", // duplicate
  ];
  for (const c of session2) {
    const m = await service.write({ userId: USER, content: c, sourceSession: "s2" });
    console.log(`  + [${m.kind} sal=${m.salience.toFixed(2)}] ${m.summary}`);
  }

  header("Search: 'when should we schedule meetings?'");
  const results = await service.search({
    userId: USER,
    query: "when should we schedule meetings?",
    k: 3,
  });
  for (const r of results) {
    console.log(`  ~ score=${r.score.toFixed(3)} sim=${r.similarity.toFixed(3)} :: ${r.memory.summary}`);
  }

  header("Recall context within a 40-token budget");
  const recall = await service.recallContext({
    userId: USER,
    query: "meeting scheduling preferences and dietary needs",
    tokenBudget: 40,
  });
  console.log(`  usedTokens=${recall.usedTokens}/40  included=${recall.included.length}`);
  console.log(recall.context.replace(/^/gm, "  "));

  header("Time passes: the coffee note goes stale (aged 30 days)");
  await store.update(USER, coffeeId, { lastAccessedAt: Date.now() - 30 * DAY_MS });
  console.log("  aged 'coffee near the office' by 30 days");

  header("Maintenance: consolidate + forget");
  const beforeActive = (await store.listAll(USER)).filter((m) => m.status === "active").length;
  const report = await service.forget(USER);
  console.log(`  ${JSON.stringify(report)}`);

  header("After forgetting - active memories");
  const all = await store.listAll(USER);
  for (const m of all.filter((m) => m.status === "active")) {
    console.log(`  * [${m.kind} sal=${m.salience.toFixed(2)}] ${m.summary}`);
  }
  const forgotten = all.filter((m) => m.status === "forgotten");
  if (forgotten.length > 0) {
    console.log("\n  forgotten (outdated/duplicate or decayed):");
    for (const m of forgotten) console.log(`    - ${m.summary}`);
  }
  const archived = all.filter((m) => m.status === "archived");
  if (archived.length > 0) {
    console.log("\n  archived (kept for history, hidden from recall):");
    for (const m of archived) console.log(`    - ${m.summary}`);
  }

  const afterActive = all.filter((m) => m.status === "active").length;
  console.log(`\nActive memories: ${beforeActive} before -> ${afterActive} after maintenance. Done.`);
  await service.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
