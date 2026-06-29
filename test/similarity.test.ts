import { describe, expect, it } from "vitest";

import { cosineSimilarity, normalize } from "../src/util/similarity.js";
import { estimateTokens } from "../src/util/tokens.js";
import { fakeEmbed } from "../src/fake-intelligence.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("is 0 when a vector is empty or zero", () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("ranks related text above unrelated text via fake embeddings", () => {
    const a = fakeEmbed("I prefer afternoon meetings after 2pm");
    const b = fakeEmbed("meetings in the afternoon work best for me");
    const c = fakeEmbed("the cat sat quietly on a warm windowsill");
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });
});

describe("normalize", () => {
  it("returns a unit vector", () => {
    const n = normalize([3, 4]);
    expect(cosineSimilarity(n, [3, 4])).toBeCloseTo(1, 6);
    expect(Math.hypot(...n)).toBeCloseTo(1, 6);
  });
});

describe("estimateTokens", () => {
  it("grows with length and is at least 1", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
});
