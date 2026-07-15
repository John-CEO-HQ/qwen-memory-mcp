#!/usr/bin/env npx tsx
/**
 * Phase 2 check: live deployed HTTPS MCP endpoint.
 * Usage:
 *   DEPLOYED_MCP_URL=https://host MCP_AUTH_TOKEN=... npm run verify:deployed
 */

import {
  callTool,
  fetchHealth,
  listTools,
  parseToolJson,
} from "../test/helpers/mcp-http-client.js";
import {
  deployedBaseUrl,
  hasDeployedTarget,
  integrationUserId,
  loadEnvFiles,
  mcpAuthToken,
} from "../test/helpers/integration-env.js";

loadEnvFiles();

function fail(msg: string): never {
  console.error(`[verify:deployed] FAIL ${msg}`);
  process.exit(1);
}

function pass(msg: string): void {
  console.log(`[verify:deployed] PASS ${msg}`);
}

async function main(): Promise<void> {
  if (!hasDeployedTarget()) {
    fail("Set DEPLOYED_MCP_URL and MCP_AUTH_TOKEN (see .env.integration.example)");
  }

  const baseUrl = deployedBaseUrl()!;
  const token = mcpAuthToken()!;
  const userId = integrationUserId();

  try {
    const health = await fetchHealth(baseUrl);
    if (!health.ok) fail("health returned ok=false");
    pass("health");
  } catch (err) {
    fail(`health: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const tools = await listTools(baseUrl, token);
    const required = [
      "memory_write",
      "memory_search",
      "memory_recall_context",
      "memory_forget",
    ];
    for (const name of required) {
      if (!tools.includes(name)) fail(`tools/list missing ${name}`);
    }
    pass(`tools/list (${required.length} tools)`);
  } catch (err) {
    fail(`tools/list: ${err instanceof Error ? err.message : String(err)}`);
  }

  const unique = `verify-${Date.now()}`;

  try {
    const writeResult = await callTool(baseUrl, token, "memory_write", {
      userId,
      content: `${unique}: prefers weekly written status updates.`,
    });
    const writeJson = parseToolJson(writeResult);
    if (writeJson.ok !== true) fail("memory_write ok!=true");
    pass("memory_write");
  } catch (err) {
    fail(`memory_write: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const searchResult = await callTool(baseUrl, token, "memory_search", {
      userId,
      query: "status updates",
      k: 5,
    }, 3);
    const searchJson = parseToolJson(searchResult);
    const results = searchJson.results as { content?: string }[] | undefined;
    if (!results?.some((r) => String(r.content ?? "").includes(unique))) {
      fail("memory_search did not return the written memory");
    }
    pass("memory_search");
  } catch (err) {
    fail(`memory_search: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const recallResult = await callTool(baseUrl, token, "memory_recall_context", {
      userId,
      query: "communication preferences",
      tokenBudget: 256,
    }, 4);
    const recallJson = parseToolJson(recallResult);
    if (!Array.isArray(recallJson.included)) fail("memory_recall_context missing included");
    pass("memory_recall_context");
  } catch (err) {
    fail(`memory_recall_context: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const forgetResult = await callTool(baseUrl, token, "memory_forget", { userId }, 5);
    parseToolJson(forgetResult);
    pass("memory_forget");
  } catch (err) {
    fail(`memory_forget: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("[verify:deployed] All checks passed.");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
