import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { Config } from "../config.js";
import { buildServer } from "../server.js";
import { SERVER_NAME, SERVER_VERSION } from "../server.js";
import type { MemoryService } from "../memory/service.js";

const MCP_PATH = "/mcp";

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

function jsonRpcError(res: ServerResponse, status: number, message: string): void {
  send(res, status, {
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  const MAX = 8 * 1024 * 1024; // 8 MB cap
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX) throw new Error("request body too large");
    chunks.push(buf);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function authorized(req: IncomingMessage, cfg: Config): boolean {
  if (!cfg.authToken) return true;
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${cfg.authToken}`;
  return header === expected;
}

/**
 * Streamable HTTP transport in stateless mode: each POST /mcp spins up a fresh
 * MCP server + transport (sharing the long-lived MemoryService) and tears them
 * down when the response closes. Stateless mode fits serverless platforms like
 * Alibaba Cloud Function Compute as well as a plain ECS process, and it is the
 * shape a remote per-user MCP URL expects.
 */
export async function startHttp(service: MemoryService, cfg: Config): Promise<void> {
  const httpServer = createServer((req, res) => {
    void handle(req, res, service, cfg);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(cfg.port, () => resolve());
  });
  console.error(
    `[qwen-memory-mcp] http ready on :${cfg.port}${MCP_PATH} ` +
      `(intelligence: ${service.intelligenceLabel}, auth: ${cfg.authToken ? "on" : "off"})`,
  );
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  service: MemoryService,
  cfg: Config,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
    send(res, 200, {
      ok: true,
      server: SERVER_NAME,
      version: SERVER_VERSION,
      intelligence: service.intelligenceLabel,
    });
    return;
  }

  if (url.pathname !== MCP_PATH) {
    jsonRpcError(res, 404, "not found");
    return;
  }

  if (!authorized(req, cfg)) {
    jsonRpcError(res, 401, "unauthorized");
    return;
  }

  // Stateless: no server-initiated streams, so GET/DELETE are not supported.
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    jsonRpcError(res, 400, err instanceof Error ? err.message : "invalid body");
    return;
  }

  const server = buildServer(service);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("[qwen-memory-mcp] request error:", err);
    if (!res.headersSent) jsonRpcError(res, 500, "internal error");
  }
}
