export interface HealthResponse {
  ok: boolean;
  server?: string;
  version?: string;
  intelligence?: string;
}

export interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function parseBody(text: string): JsonRpcResponse {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as JsonRpcResponse;
  }
  // Streamable HTTP may return SSE; take the first data line with JSON.
  for (const line of trimmed.split("\n")) {
    if (line.startsWith("data:")) {
      const payload = line.slice(5).trim();
      if (payload && payload !== "[DONE]") {
        return JSON.parse(payload) as JsonRpcResponse;
      }
    }
  }
  throw new Error(`unable to parse MCP response: ${trimmed.slice(0, 200)}`);
}

export async function fetchHealth(baseUrl: string): Promise<HealthResponse> {
  const res = await fetch(`${baseUrl}/health`);
  if (!res.ok) {
    throw new Error(`health failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as HealthResponse;
}

export async function mcpRequest(
  baseUrl: string,
  body: unknown,
  authToken: string | null,
): Promise<JsonRpcResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`mcp HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return parseBody(text);
}

export async function listTools(baseUrl: string, authToken: string | null): Promise<string[]> {
  const res = await mcpRequest(
    baseUrl,
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    authToken,
  );
  if (res.error) throw new Error(res.error.message);
  const tools = (res.result as { tools?: { name: string }[] } | undefined)?.tools ?? [];
  return tools.map((t) => t.name);
}

export async function callTool(
  baseUrl: string,
  authToken: string | null,
  name: string,
  args: Record<string, unknown>,
  id = 2,
): Promise<unknown> {
  const res = await mcpRequest(
    baseUrl,
    {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    },
    authToken,
  );
  if (res.error) throw new Error(res.error.message);
  return res.result;
}

/** Parse JSON from MCP tool result text content blocks. */
export function parseToolJson(result: unknown): Record<string, unknown> {
  const content = (result as { content?: { type: string; text?: string }[] } | undefined)?.content;
  const text = content?.find((c) => c.type === "text")?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}
