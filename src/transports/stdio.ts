import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { buildServer } from "../server.js";
import type { MemoryService } from "../memory/service.js";

/**
 * stdio transport: one long-lived server over stdin/stdout. This is how local
 * MCP clients (Claude Desktop, MCP Inspector, the demo) launch the server as a
 * child process.
 */
export async function startStdio(service: MemoryService): Promise<void> {
  const server = buildServer(service);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep logs on stderr so stdout stays a clean JSON-RPC channel.
  console.error(`[qwen-memory-mcp] stdio ready (intelligence: ${service.intelligenceLabel})`);
}
