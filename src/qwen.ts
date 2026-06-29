/**
 * ===========================================================================
 *  PROOF OF ALIBABA CLOUD / QWEN USAGE
 * ===========================================================================
 * This file is the single integration point with Alibaba Cloud Model Studio
 * (DashScope). It powers the "intelligence" of the memory system:
 *
 *   - Embeddings via Qwen `text-embedding-v3`  -> semantic retrieval
 *   - Reasoning via a Qwen chat model (`qwen-plus` by default) for:
 *       * analyze()     -> salience scoring, tagging, summarization
 *       * consolidate() -> merging related memories + detecting outdated facts
 *
 * It talks to the DashScope OpenAI-compatible endpoint:
 *   https://dashscope-intl.aliyuncs.com/compatible-mode/v1   (international)
 *   https://dashscope.aliyuncs.com/compatible-mode/v1        (mainland China)
 *
 * The Qwen API key is a backend-only platform secret; it is never shipped to a
 * client or end-user device.
 * ===========================================================================
 */

import type { Config } from "./config.js";
import type {
  ConsolidationResult,
  Memory,
  MemoryAnalysis,
  MemoryIntelligence,
  MemoryKind,
} from "./types.js";

const VALID_KINDS: MemoryKind[] = ["preference", "fact", "event", "task", "other"];

function coerceKind(value: unknown): MemoryKind {
  return VALID_KINDS.includes(value as MemoryKind) ? (value as MemoryKind) : "other";
}

function clamp01(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 12);
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class QwenIntelligence implements MemoryIntelligence {
  readonly label: string;
  private readonly cfg: Config["qwen"];

  constructor(cfg: Config["qwen"]) {
    this.cfg = cfg;
    this.label = `qwen(${cfg.chatModel} + ${cfg.embeddingModel})`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.fetchJson("/embeddings", {
      model: this.cfg.embeddingModel,
      input: texts,
      encoding_format: "float",
    });
    const data = (res as { data?: { embedding: number[]; index: number }[] }).data ?? [];
    // Preserve input order regardless of how the API returns them.
    const ordered = [...data].sort((a, b) => a.index - b.index);
    if (ordered.length !== texts.length) {
      throw new Error(
        `embedding count mismatch: expected ${texts.length}, got ${ordered.length}`,
      );
    }
    return ordered.map((d) => d.embedding);
  }

  async analyze(content: string): Promise<MemoryAnalysis> {
    const system =
      "You distill durable agent memories. Given one item the user wants " +
      "remembered, return STRICT JSON with keys: summary (<=140 chars, plain " +
      "ascii), tags (3-6 short lowercase keywords), salience (0..1 importance " +
      "for long-term recall; stable preferences and commitments are high, " +
      "small talk is low), kind (one of preference|fact|event|task|other). " +
      'Respond with JSON only, e.g. {"summary":"...","tags":["..."],' +
      '"salience":0.8,"kind":"preference"}.';
    const parsed = await this.chatJson([
      { role: "system", content: system },
      { role: "user", content },
    ]);
    return {
      summary: typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : content.slice(0, 140),
      tags: asStringArray(parsed.tags),
      salience: clamp01(parsed.salience),
      kind: coerceKind(parsed.kind),
    };
  }

  async consolidate(
    cluster: Pick<Memory, "id" | "content" | "createdAt">[],
  ): Promise<ConsolidationResult> {
    const sorted = [...cluster].sort((a, b) => a.createdAt - b.createdAt);
    const lines = sorted
      .map(
        (m, i) =>
          `[${i}] id=${m.id} time=${new Date(m.createdAt).toISOString()} :: ${m.content}`,
      )
      .join("\n");
    const system =
      "You merge a cluster of related agent memories into one canonical " +
      "memory, resolving contradictions in favor of the most recent item. " +
      "Return STRICT JSON with keys: summary (the merged durable statement, " +
      "<=200 chars, ascii), tags (3-6 lowercase keywords), salience (0..1), " +
      "kind (preference|fact|event|task|other), outdated_ids (array of the " +
      "input ids whose information is now superseded/contradicted and should " +
      "be forgotten). Respond with JSON only.";
    const parsed = await this.chatJson([
      { role: "system", content: system },
      { role: "user", content: lines },
    ]);
    const validIds = new Set(cluster.map((m) => m.id));
    const outdatedIds = asStringArray(parsed.outdated_ids).filter((id) => validIds.has(id));
    return {
      summary: typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : (sorted[sorted.length - 1]?.content ?? "").slice(0, 200),
      tags: asStringArray(parsed.tags),
      salience: clamp01(parsed.salience),
      kind: coerceKind(parsed.kind),
      outdatedIds,
    };
  }

  private async chatJson(messages: ChatMessage[]): Promise<Record<string, unknown>> {
    const res = await this.fetchJson("/chat/completions", {
      model: this.cfg.chatModel,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const content =
      (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
        ?.content ?? "{}";
    return safeParseJson(content);
  }

  private async fetchJson(path: string, body: unknown): Promise<unknown> {
    const url = `${this.cfg.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DashScope ${path} failed: ${res.status} ${res.statusText} ${text}`);
    }
    return (await res.json()) as unknown;
  }
}

function safeParseJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Models sometimes wrap JSON in prose/markdown fences; salvage the body.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}
