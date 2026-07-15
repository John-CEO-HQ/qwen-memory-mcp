import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load `.env` and `.env.integration` from cwd into process.env.
 * Does not override variables already set in the shell. No-op if files are missing.
 */
export function loadEnvFiles(cwd: string = process.cwd()): void {
  for (const name of [".env", ".env.integration"]) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}
