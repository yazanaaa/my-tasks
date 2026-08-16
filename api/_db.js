import { neon } from '@neondatabase/serverless';
import { hashPassword } from './_security.js';

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
      try {
        const version = await db`SELECT value FROM app_meta WHERE key = 'schema_version' LIMIT 1`;
        if (version[0]?.value === '1') return;
      } catch (e) {
        // First run (or upgrade from the pre-versioned schema): run the migration below.
      }

      await db.transaction((tx) => [
        tx`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
        tx`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at BIGINT NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL DEFAULT 0
          )`,
        tx`
          CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL DEFAULT 0
          )`,
        tx`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)`,
        tx`
          CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT 'list',
            color TEXT NOT NULL DEFAULT '#FFD60A',
            recurring BOOLEAN NOT NULL DEFAULT FALSE,
            pinned BOOLEAN NOT NULL DEFAULT FALSE,
            "order" INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL DEFAULT 0
          )`,
        tx`ALTER TABLE lists ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE`,
        tx`CREATE INDEX IF NOT EXISTS lists_user_idx ON lists (user_id)`,
        tx`
          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'not_started',
            "order" INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL DEFAULT 0
          )`,
        tx`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE`,
        tx`CREATE INDEX IF NOT EXISTS tasks_user_list_idx ON tasks (user_id, list_id)`,
      ]);

      const adminEmail = String(process.env.ADMIN_EMAIL || 'yazanaboatieh@gmail.com').trim().toLowerCase();
      const adminPassword = process.env.ADMIN_PASSWORD;
      const existingAdmin = await db`SELECT id FROM users WHERE email = ${adminEmail} LIMIT 1`;
      if (!existingAdmin.length && adminPassword) {
        const passwordHash = await hashPassword(adminPassword);
        await db`
          INSERT INTO users (id, email, password_hash, role, active, created_at, updated_at)
          VALUES ('admin-primary', ${adminEmail}, ${passwordHash}, 'admin', TRUE, ${Date.now()}, ${Date.now()})
          ON CONFLICT (email) DO NOTHING`;
      }
      const admin = await db`SELECT id FROM users WHERE email = ${adminEmail} LIMIT 1`;
      if (admin.length) {
        await db`UPDATE users SET role = 'admin', active = TRUE WHERE id = ${admin[0].id}`;
        await db`UPDATE lists SET user_id = ${admin[0].id} WHERE user_id IS NULL`;
        await db`
          UPDATE tasks t SET user_id = l.user_id
          FROM lists l WHERE t.list_id = l.id AND t.user_id IS NULL`;
      }
      await db`DELETE FROM sessions WHERE expires_at <= ${Date.now()}`;
      await db`
        INSERT INTO app_meta (key, value) VALUES ('schema_version', '1')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
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
