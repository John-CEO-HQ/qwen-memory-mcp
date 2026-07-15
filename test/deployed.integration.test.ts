import { describe, expect, it } from "vitest";

import {
  callTool,
  fetchHealth,
  listTools,
  parseToolJson,
} from "./helpers/mcp-http-client.js";
import {
  deployedBaseUrl,
  hasDeployedTarget,
  integrationUserId,
  mcpAuthToken,
} from "./helpers/integration-env.js";

describe.skipIf(!hasDeployedTarget())("Deployed MCP (remote)", () => {
  const baseUrl = deployedBaseUrl()!;
  const token = mcpAuthToken()!;
  const userId = integrationUserId();

  it("health is ok", async () => {
    const health = await fetchHealth(baseUrl);
    expect(health.ok).toBe(true);
    expect(health.intelligence?.toLowerCase()).toContain("qwen");
  });

  it("lists four memory tools", async () => {
    const names = await listTools(baseUrl, token);
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(names).toContain("memory_write");
    expect(names).toContain("memory_search");
    expect(names).toContain("memory_recall_context");
    expect(names).toContain("memory_forget");
  });

  it("full memory tool lifecycle", async () => {
    const unique = `deployed-${Date.now()}`;
    const writeResult = await callTool(baseUrl, token, "memory_write", {
      userId,
      content: `${unique}: prefers concise weekly status emails.`,
    });
    const writeJson = parseToolJson(writeResult);
    expect(writeJson.ok).toBe(true);

    const searchResult = await callTool(baseUrl, token, "memory_search", {
      userId,
      query: "status email preference",
      k: 5,
    }, 3);
    const searchJson = parseToolJson(searchResult);
    const results = searchJson.results as { content?: string }[] | undefined;
    expect(results?.some((r) => String(r.content ?? "").includes(unique))).toBe(true);

    const recallResult = await callTool(baseUrl, token, "memory_recall_context", {
      userId,
      query: "communication preferences",
      tokenBudget: 256,
    }, 4);
    const recallJson = parseToolJson(recallResult);
    expect(recallJson.included).toBeDefined();

    const forgetResult = await callTool(baseUrl, token, "memory_forget", { userId }, 5);
    const forgetJson = parseToolJson(forgetResult);
    expect(forgetJson).toBeDefined();
  });
});
