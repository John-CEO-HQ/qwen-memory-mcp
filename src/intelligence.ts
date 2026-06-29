import type { Config } from "./config.js";
import { FakeIntelligence } from "./fake-intelligence.js";
import { QwenIntelligence } from "./qwen.js";
import type { MemoryIntelligence } from "./types.js";

/** Picks the Qwen-backed brain, or the offline fake when no key is configured. */
export function createIntelligence(cfg: Config): MemoryIntelligence {
  if (cfg.qwen.useFake) return new FakeIntelligence();
  return new QwenIntelligence(cfg.qwen);
}
