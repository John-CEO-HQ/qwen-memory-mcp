#!/usr/bin/env npx tsx
/**
 * Phase 1 quick check: live DashScope embed + analyze.
 * Usage: npm run verify:qwen  (loads .env from cwd)
 */

import { loadConfig } from "../src/config.js";
import { QwenIntelligence } from "../src/qwen.js";
import { hasQwenKey, loadEnvFiles } from "../test/helpers/integration-env.js";

loadEnvFiles();

function fail(msg: string): never {
  console.error(`[verify:qwen] FAIL ${msg}`);
  process.exit(1);
}

function pass(msg: string): void {
  console.log(`[verify:qwen] PASS ${msg}`);
}

async function main(): Promise<void> {
  if (!hasQwenKey()) {
    fail("QWEN_API_KEY not set or USE_FAKE_QWEN is enabled. Copy .env.example to .env");
  }

  const cfg = loadConfig({ ...process.env, USE_FAKE_QWEN: "" });
  const qwen = new QwenIntelligence(cfg.qwen);

  try {
    const vectors = await qwen.embed(["verify qwen connectivity"]);
    if (vectors.length !== 1 || vectors[0].length < 8) {
      fail(`embed returned unexpected shape (len=${vectors[0]?.length ?? 0})`);
    }
    pass(`embed (dimensions=${vectors[0].length})`);
  } catch (err) {
    fail(`embed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const analysis = await qwen.analyze("I prefer morning meetings before 11am.");
    if (!analysis.summary || analysis.tags.length === 0) {
      fail("analyze returned empty summary or tags");
    }
    pass(`analyze (kind=${analysis.kind}, salience=${analysis.salience.toFixed(2)})`);
  } catch (err) {
    fail(`analyze: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("[verify:qwen] All checks passed.");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
