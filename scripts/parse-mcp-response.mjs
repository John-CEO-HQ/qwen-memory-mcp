#!/usr/bin/env node
/** Read MCP HTTP body (JSON or SSE) from stdin; print pretty JSON to stdout. */
let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  const trimmed = data.trim();
  let jsonText = trimmed;
  if (!trimmed.startsWith("{")) {
    for (const line of trimmed.split("\n")) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          jsonText = payload;
          break;
        }
      }
    }
  }
  try {
    process.stdout.write(`${JSON.stringify(JSON.parse(jsonText), null, 2)}\n`);
  } catch {
    console.error(`parse-mcp-response: unable to parse: ${trimmed.slice(0, 300)}`);
    process.exit(1);
  }
});
