export { loadEnvFiles } from "../../src/load-env.js";

export function hasQwenKey(env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.QWEN_API_KEY?.trim() ?? "";
  if (!key) return false;
  const fake = (env.USE_FAKE_QWEN ?? "").toLowerCase();
  return fake !== "1" && fake !== "true" && fake !== "yes";
}

export function hasMysql(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.MYSQL_HOST?.trim() &&
      env.MYSQL_USER?.trim() &&
      env.MYSQL_PASSWORD !== undefined &&
      env.MYSQL_DATABASE?.trim(),
  );
}

export function deployedBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.DEPLOYED_MCP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function mcpAuthToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.MCP_AUTH_TOKEN?.trim() || env.DEPLOYED_MCP_AUTH_TOKEN?.trim();
  return token || null;
}

export function hasDeployedTarget(env: NodeJS.ProcessEnv = process.env): boolean {
  return deployedBaseUrl(env) !== null && mcpAuthToken(env) !== null;
}

export function integrationUserId(env: NodeJS.ProcessEnv = process.env): string {
  return env.INTEGRATION_TEST_USER_ID?.trim() || "integration-test-user";
}
