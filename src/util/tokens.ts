/**
 * Lightweight token estimation. We deliberately avoid a heavy tokenizer
 * dependency: a chars/4 heuristic is accurate enough for budgeting which
 * memories fit in a limited context window, and it is provider-agnostic.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
