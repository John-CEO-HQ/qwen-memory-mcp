import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { MemoryService } from "./memory/service.js";
import type { Memory, RankedMemory } from "./types.js";

export const SERVER_NAME = "qwen-memory-mcp";
export const SERVER_VERSION = "0.1.0";

function memoryView(m: Memory) {
  return {
    id: m.id,
    summary: m.summary,
    content: m.content,
    tags: m.tags,
    kind: m.kind,
    salience: Number(m.salience.toFixed(3)),
    createdAt: m.createdAt,
    lastAccessedAt: m.lastAccessedAt,
    accessCount: m.accessCount,
  };
}

function rankedView(r: RankedMemory) {
  return {
    ...memoryView(r.memory),
    similarity: Number(r.similarity.toFixed(3)),
    score: Number(r.score.toFixed(3)),
  };
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * Builds a fresh MCP server bound to a MemoryService and registers the four
 * memory tools. A new server is created per stdio process and (in stateless
 * HTTP mode) per request; the underlying MemoryService/store is shared.
 */
export function buildServer(service: MemoryService): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "memory_write",
    {
      title: "Write memory",
      description:
        "Persist something worth remembering about a user (a preference, fact, " +
        "commitment, or event). Qwen derives a short summary, tags, importance " +
        "(salience), and kind. Call this whenever the user reveals durable " +
        "information you should recall in future sessions.",
      inputSchema: {
        userId: z.string().min(1).describe("Stable id namespacing this user's memories."),
        content: z.string().min(1).describe("The information to remember, in plain language."),
        sourceSession: z
          .string()
          .optional()
          .describe("Optional originating session/conversation id."),
        salience: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Optional importance override in [0,1]; otherwise Qwen decides."),
      },
    },
    async (args) => {
      const memory = await service.write({
        userId: args.userId,
        content: args.content,
        sourceSession: args.sourceSession ?? null,
        salience: args.salience,
      });
      return jsonResult({ ok: true, memory: memoryView(memory) });
    },
  );

  server.registerTool(
    "memory_search",
    {
      title: "Search memories",
      description:
        "Semantic search over a user's memories, ranked by similarity, " +
        "importance, recency, and how often each memory has been recalled. " +
        "Returns the top matches. Recalled memories are reinforced.",
      inputSchema: {
        userId: z.string().min(1),
        query: z.string().min(1).describe("What you want to recall."),
        k: z.number().int().min(1).max(50).optional().describe("Max results (default 5)."),
      },
    },
    async (args) => {
      const ranked = await service.search({ userId: args.userId, query: args.query, k: args.k });
      return jsonResult({ ok: true, count: ranked.length, results: ranked.map(rankedView) });
    },
  );

  server.registerTool(
    "memory_recall_context",
    {
      title: "Recall context within a token budget",
      description:
        "Returns the most critical memories for a query, greedily packed to fit " +
        "a token budget, as a ready-to-inject context block. Use this to load " +
        "long-term memory into a limited context window before answering.",
      inputSchema: {
        userId: z.string().min(1),
        query: z.string().min(1),
        tokenBudget: z
          .number()
          .int()
          .min(16)
          .max(32000)
          .describe("Approximate max tokens the returned context may use."),
      },
    },
    async (args) => {
      const recall = await service.recallContext({
        userId: args.userId,
        query: args.query,
        tokenBudget: args.tokenBudget,
      });
      return jsonResult({
        ok: true,
        usedTokens: recall.usedTokens,
        tokenBudget: args.tokenBudget,
        includedCount: recall.included.length,
        context: recall.context,
        included: recall.included.map(rankedView),
      });
    },
  );

  server.registerTool(
    "memory_forget",
    {
      title: "Consolidate and forget",
      description:
        "Runs the maintenance pass: clusters of related memories are merged by " +
        "Qwen into one canonical memory, contradicted/outdated items are " +
        "forgotten, and stale low-importance memories decay away. Returns a " +
        "report of what was consolidated, archived, forgotten, and retained.",
      inputSchema: {
        userId: z.string().min(1),
      },
    },
    async (args) => {
      const report = await service.forget(args.userId);
      return jsonResult({ ok: true, report });
    },
  );

  return server;
}
