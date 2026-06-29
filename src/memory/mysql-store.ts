/**
 * Production store backed by Alibaba Cloud RDS / PolarDB for MySQL.
 *
 * This is the persistence half of the "running on Alibaba Cloud" proof: point
 * MYSQL_* at an RDS/PolarDB instance and the server stores every memory there.
 *
 * Vectors are kept as JSON and scored in the application layer. For larger
 * deployments, migrate retrieval to AnalyticDB for PostgreSQL (pgvector) and
 * push the cosine search into the database; the MemoryStore interface keeps
 * that swap local to this file.
 */

import mysql from "mysql2/promise";

import type { MysqlConfig } from "../config.js";
import type { Memory, MemoryKind, MemoryStatus } from "../types.js";
import type { MemoryStore } from "./store.js";

interface Row {
  id: string;
  user_id: string;
  content: string;
  summary: string;
  tags: string | null;
  kind: string;
  salience: number;
  embedding: string | null;
  created_at: number | string;
  last_accessed_at: number | string;
  access_count: number;
  status: string;
  superseded_by: string | null;
  source_session: string | null;
}

function toMemory(row: Row): Memory {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    summary: row.summary,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
    kind: row.kind as MemoryKind,
    salience: Number(row.salience),
    embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : [],
    createdAt: Number(row.created_at),
    lastAccessedAt: Number(row.last_accessed_at),
    accessCount: Number(row.access_count),
    status: row.status as MemoryStatus,
    supersededBy: row.superseded_by,
    sourceSession: row.source_session,
  };
}

const COLUMNS: Record<keyof Memory, string> = {
  id: "id",
  userId: "user_id",
  content: "content",
  summary: "summary",
  tags: "tags",
  kind: "kind",
  salience: "salience",
  embedding: "embedding",
  createdAt: "created_at",
  lastAccessedAt: "last_accessed_at",
  accessCount: "access_count",
  status: "status",
  supersededBy: "superseded_by",
  sourceSession: "source_session",
};

function encode(key: keyof Memory, value: unknown): unknown {
  if (key === "tags" || key === "embedding") return JSON.stringify(value ?? []);
  return value;
}

export class MysqlMemoryStore implements MemoryStore {
  private readonly pool: mysql.Pool;

  constructor(cfg: MysqlConfig) {
    this.pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      connectionLimit: 8,
      waitForConnections: true,
      enableKeepAlive: true,
    });
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id              VARCHAR(64)  NOT NULL PRIMARY KEY,
        user_id         VARCHAR(128) NOT NULL,
        content         MEDIUMTEXT   NOT NULL,
        summary         TEXT         NOT NULL,
        tags            JSON         NULL,
        kind            VARCHAR(32)  NOT NULL DEFAULT 'other',
        salience        DOUBLE       NOT NULL DEFAULT 0.5,
        embedding       JSON         NULL,
        created_at      BIGINT       NOT NULL,
        last_accessed_at BIGINT      NOT NULL,
        access_count    INT          NOT NULL DEFAULT 0,
        status          VARCHAR(16)  NOT NULL DEFAULT 'active',
        superseded_by   VARCHAR(64)  NULL,
        source_session  VARCHAR(128) NULL,
        INDEX idx_user_status (user_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async put(memory: Memory): Promise<void> {
    await this.pool.query(
      `INSERT INTO memories
        (id, user_id, content, summary, tags, kind, salience, embedding,
         created_at, last_accessed_at, access_count, status, superseded_by, source_session)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memory.id,
        memory.userId,
        memory.content,
        memory.summary,
        JSON.stringify(memory.tags),
        memory.kind,
        memory.salience,
        JSON.stringify(memory.embedding),
        memory.createdAt,
        memory.lastAccessedAt,
        memory.accessCount,
        memory.status,
        memory.supersededBy,
        memory.sourceSession,
      ],
    );
  }

  async update(userId: string, id: string, patch: Partial<Memory>): Promise<void> {
    const keys = Object.keys(patch).filter(
      (k) => k !== "id" && k !== "userId",
    ) as (keyof Memory)[];
    if (keys.length === 0) return;
    const setSql = keys.map((k) => `${COLUMNS[k]} = ?`).join(", ");
    const values = keys.map((k) => encode(k, patch[k]));
    await this.pool.query(
      `UPDATE memories SET ${setSql} WHERE id = ? AND user_id = ?`,
      [...values, id, userId],
    );
  }

  async get(userId: string, id: string): Promise<Memory | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM memories WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId],
    );
    const list = rows as Row[];
    return list[0] ? toMemory(list[0]) : null;
  }

  async listActive(userId: string): Promise<Memory[]> {
    const [rows] = await this.pool.query(
      "SELECT * FROM memories WHERE user_id = ? AND status = 'active'",
      [userId],
    );
    return (rows as Row[]).map(toMemory);
  }

  async listAll(userId: string): Promise<Memory[]> {
    const [rows] = await this.pool.query(
      "SELECT * FROM memories WHERE user_id = ?",
      [userId],
    );
    return (rows as Row[]).map(toMemory);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.pool.query("DELETE FROM memories WHERE id = ? AND user_id = ?", [id, userId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
