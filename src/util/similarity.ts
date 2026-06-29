/** Vector math used for semantic retrieval and clustering. */

export function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function magnitude(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum);
}

/** Cosine similarity in [-1,1]; 0 when either vector is empty/zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) return 0;
  return dot(a, b) / (ma * mb);
}

/** Returns a unit-length copy of the vector (or a copy if it is zero). */
export function normalize(a: number[]): number[] {
  const m = magnitude(a);
  if (m === 0) return [...a];
  return a.map((v) => v / m);
}
