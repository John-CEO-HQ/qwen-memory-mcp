import { randomUUID } from "node:crypto";

export function newId(prefix = "mem"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
