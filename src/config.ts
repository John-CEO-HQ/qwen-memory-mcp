/**
 * Centralized, host-neutral configuration. Everything is read from the
 * environment once at startup so the rest of the code stays testable and never
 * touches `process.env` directly.
 */

export type StoreKind = "memory" | "file" | "mysql";
export type TransportKind = "stdio" | "http";

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface ForgettingConfig {
  decayHalfLifeDays: number;
  consolidateSimilarity: number;
  retentionThreshold: number;
  salienceFloor: number;
}

export interface Config {
  qwen: {
    apiKey: string;
    baseUrl: string;
    chatModel: string;
    embeddingModel: string;
    useFake: boolean;
  };
  store: StoreKind;
  fileStorePath: string;
  mysql: MysqlConfig;
  transport: TransportKind;
  port: number;
  authToken: string | null;
  forgetting: ForgettingConfig;
}

function str(env: NodeJS.ProcessEnv, key: string, fallback = ""): string {
  const v = env[key];
  return v === undefined || v === "" ? fallback : v;
}

function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const v = env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = str(env, key).toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = str(env, "QWEN_API_KEY");
  // Fall back to the offline intelligence when explicitly asked, or whenever no
  // API key is configured, so the demo and tests run without network access.
  const useFake = bool(env, "USE_FAKE_QWEN") || apiKey === "";

  const store = (str(env, "MEMORY_STORE", "file") as StoreKind) || "file";
  const transport = (str(env, "MCP_TRANSPORT", "stdio") as TransportKind) || "stdio";

  return {
    qwen: {
      apiKey,
      baseUrl: str(
        env,
        "QWEN_BASE_URL",
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      ),
      chatModel: str(env, "QWEN_CHAT_MODEL", "qwen-plus"),
      embeddingModel: str(env, "QWEN_EMBEDDING_MODEL", "text-embedding-v3"),
      useFake,
    },
    store,
    fileStorePath: str(env, "MEMORY_FILE_PATH", "./.data/memories.json"),
    mysql: {
      host: str(env, "MYSQL_HOST"),
      port: num(env, "MYSQL_PORT", 3306),
      user: str(env, "MYSQL_USER"),
      password: str(env, "MYSQL_PASSWORD"),
      database: str(env, "MYSQL_DATABASE", "qwen_memory"),
    },
    transport,
    port: num(env, "PORT", 8080),
    authToken: str(env, "MCP_AUTH_TOKEN") || null,
    forgetting: {
      decayHalfLifeDays: num(env, "MEMORY_DECAY_HALF_LIFE_DAYS", 14),
      consolidateSimilarity: num(env, "MEMORY_CONSOLIDATE_SIMILARITY", 0.86),
      retentionThreshold: num(env, "MEMORY_RETENTION_THRESHOLD", 0.12),
      salienceFloor: num(env, "MEMORY_SALIENCE_FLOOR", 0.8),
    },
  };
}
