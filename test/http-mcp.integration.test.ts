import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  callTool,
  fetchHealth,
  listTools,
  parseToolJson,
} from "./helpers/mcp-http-client.js";
import { hasQwenKey, integrationUserId } from "./helpers/integration-env.js";

const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function waitForHealth(baseUrl: string, attempts = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      fetchHealth(baseUrl)
        .then(() => resolve())
        .catch(() => {
          if (n >= attempts) reject(new Error("server did not become healthy"));
          else setTimeout(tick, 200);
        });
    };
    tick();
  });
}

describe.skipIf(!hasQwenKey())("HTTP MCP (local server)", () => {
  let proc: ChildProcess | null = null;
  let baseUrl = "";
  const authToken = "integration-test-token";
  const userId = integrationUserId();

  beforeAll(async () => {
    const port = 18080 + Math.floor(Math.random() * 8000);
    baseUrl = `http://127.0.0.1:${port}`;
    const env = {
      ...process.env,
      USE_FAKE_QWEN: "",
      MCP_TRANSPORT: "http",
      PORT: String(port),
      MCP_AUTH_TOKEN: authToken,
      MEMORY_STORE: "memory",
    };
    proc = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: moduleRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForHealth(baseUrl);
  }, 60_000);

  afterAll(async () => {
    if (proc && !proc.killed) {
      proc.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        proc?.on("exit", () => resolve());
        setTimeout(() => {
          proc?.kill("SIGKILL");
          resolve();
        }, 3000);
      });
    }
  });

  it("health reports live qwen intelligence", async () => {
    const health = await fetchHealth(baseUrl);
    expect(health.ok).toBe(true);
    expect(health.intelligence?.toLowerCase()).toContain("qwen");
  });

  it("lists four memory tools", async () => {
    const names = await listTools(baseUrl, authToken);
    expect(names).toContain("memory_write");
    expect(names).toContain("memory_search");
    expect(names).toContain("memory_recall_context");
    expect(names).toContain("memory_forget");
  });

  it("memory_write and memory_search round-trip", async () => {
    const unique = `http-mcp-${Date.now()}`;
    const writeResult = await callTool(baseUrl, authToken, "memory_write", {
      userId,
      content: `${unique}: prefers async standups on Mondays.`,
    });
    const writeJson = parseToolJson(writeResult);
    expect(writeJson.ok).toBe(true);

    const searchResult = await callTool(baseUrl, authToken, "memory_search", {
      userId,
      query: "standup schedule",
      k: 5,
    }, 3);
    const searchJson = parseToolJson(searchResult);
    const results = searchJson.results as { content?: string }[] | undefined;
    expect(Array.isArray(results)).toBe(true);
    expect(results?.some((r) => String(r.content ?? "").includes(unique))).toBe(true);
  });
});
