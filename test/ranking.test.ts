import { describe, expect, it } from "vitest";

import { packContext, rankMemories } from "../src/memory/ranking.js";
import { estimateTokens } from "../src/util/tokens.js";
import { fakeEmbed } from "../src/fake-intelligence.js";
import type { Memory } from "../src/types.js";

function mem(partial: Partial<Memory> & { id: string; content: string }): Memory {
  const now = Date.now();
  return {
    userId: "u1",
    summary: partial.content,
    tags: [],
    kind: "fact",
    salience: 0.5,
    embedding: fakeEmbed(partial.content),
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    status: "active",
    supersededBy: null,
    sourceSession: null,
    ...partial,
  };
}

describe("rankMemories", () => {
  it("ranks the semantically closest memory first", () => {
    const memories = [
      mem({ id: "a", content: "the quarterly budget spreadsheet is due friday" }),
      mem({ id: "b", content: "I prefer afternoon meetings after 2pm" }),
      mem({ id: "c", content: "my favorite programming language is typescript" }),
    ];
    const q = fakeEmbed("what time do you like meetings");
    const ranked = rankMemories(q, memories, Date.now());
    expect(ranked[0]?.memory.id).toBe("b");
  });

  it("boosts higher-salience memories on ties", () => {
    const a = mem({ id: "a", content: "duplicate text here", salience: 0.2 });
    const b = mem({ id: "b", content: "duplicate text here", salience: 0.9 });
    const q = fakeEmbed("duplicate text here");
    const ranked = rankMemories(q, [a, b], Date.now());
    expect(ranked[0]?.memory.id).toBe("b");
  });
});

describe("packContext", () => {
  it("never exceeds the token budget", () => {
    const memories = Array.from({ length: 20 }, (_, i) =>
      mem({ id: `m${i}`, content: `memory number ${i} with some descriptive padding text` }),
    );
    const q = fakeEmbed("memory descriptive padding");
    const ranked = rankMemories(q, memories, Date.now());
    const budget = 30;
    const packed = packContext(ranked, budget);
    expect(packed.usedTokens).toBeLessThanOrEqual(budget);
    expect(estimateTokens(packed.context)).toBeLessThanOrEqual(budget + 1);
    expect(packed.included.length).toBeGreaterThan(0);
  });

  it("includes nothing when the budget is too small for any item", () => {
    const memories = [mem({ id: "a", content: "a fairly long memory that will not fit" })];
    const ranked = rankMemories(fakeEmbed("long memory"), memories, Date.now());
    const packed = packContext(ranked, 2);
    expect(packed.included.length).toBe(0);
    expect(packed.usedTokens).toBe(0);
  });
});
