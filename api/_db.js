import { neon } from '@neondatabase/serverless';

let sqlInstance = null;
let schemaReady = null;

export function sql() {
  if (!sqlInstance) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    sqlInstance = neon(process.env.DATABASE_URL);
  }
  return sqlInstance;
}

export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = sql();
      await db`
        CREATE TABLE IF NOT EXISTS lists (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          icon TEXT NOT NULL DEFAULT 'list',
          color TEXT NOT NULL DEFAULT '#FFD60A',
          recurring BOOLEAN NOT NULL DEFAULT FALSE,
          pinned BOOLEAN NOT NULL DEFAULT FALSE,
          "order" INTEGER NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL DEFAULT 0
        )`;
      await db`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'not_started',
          "order" INTEGER NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL DEFAULT 0
        )`;
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
