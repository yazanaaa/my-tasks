import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from './security.js';

// Everything lives in its own Postgres schema so the new app starts clean
// without touching the tables of the previous version.
// Bump on every schema change, or migrate() returns early on existing databases.
const SCHEMA_VERSION = '6';

let sqlInstance = null;
let schemaReady = null;

export function sql() {
  if (!sqlInstance) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    sqlInstance = neon(process.env.DATABASE_URL);
  }
  return sqlInstance;
}

export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = migrate().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

async function migrate() {
  const db = sql();
  try {
    const [row] = await db`
      SELECT (SELECT value FROM mt.meta WHERE key = 'schema_version') AS version,
             EXISTS (SELECT 1 FROM mt.users WHERE role = 'admin') AS has_admin`;
    // >= so an older deployment never re-runs its migration over a newer schema.
    if (Number(row.version) >= Number(SCHEMA_VERSION)) {
      if (!row.has_admin) await seedAdmin();
      return;
    }
  } catch {
    // Schema not created yet.
  }

  await db.transaction((tx) => [
    tx`CREATE SCHEMA IF NOT EXISTS mt`,
    tx`CREATE TABLE IF NOT EXISTS mt.meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    tx`
      CREATE TABLE IF NOT EXISTS mt.users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
    tx`
      CREATE TABLE IF NOT EXISTS mt.sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES mt.users(id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
    tx`
      CREATE TABLE IF NOT EXISTS mt.projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES mt.users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#FF5A1F',
        icon TEXT NOT NULL DEFAULT 'folder',
        view TEXT NOT NULL DEFAULT 'list',
        due_date TEXT,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        position DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
    tx`CREATE INDEX IF NOT EXISTS projects_user_idx ON mt.projects (user_id)`,
    tx`
      CREATE TABLE IF NOT EXISTS mt.sections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES mt.users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES mt.projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
    tx`CREATE INDEX IF NOT EXISTS sections_user_idx ON mt.sections (user_id)`,
    tx`
      CREATE TABLE IF NOT EXISTS mt.tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES mt.users(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES mt.projects(id) ON DELETE CASCADE,
        section_id TEXT REFERENCES mt.sections(id) ON DELETE SET NULL,
        parent_id TEXT REFERENCES mt.tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        priority SMALLINT NOT NULL DEFAULT 0,
        due_date TEXT,
        due_time TEXT,
        recurrence TEXT,
        tags TEXT[] NOT NULL DEFAULT '{}',
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at BIGINT,
        position DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
    tx`CREATE INDEX IF NOT EXISTS tasks_user_idx ON mt.tasks (user_id, completed)`,
    tx`
      CREATE TABLE IF NOT EXISTS mt.habits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES mt.users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#FF5A1F',
        icon TEXT NOT NULL DEFAULT 'flame',
        days SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        position DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
    tx`CREATE INDEX IF NOT EXISTS habits_user_idx ON mt.habits (user_id)`,
    tx`
      CREATE TABLE IF NOT EXISTS mt.habit_logs (
        habit_id TEXT NOT NULL REFERENCES mt.habits(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES mt.users(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (habit_id, date)
      )`,
    tx`CREATE INDEX IF NOT EXISTS habit_logs_user_idx ON mt.habit_logs (user_id, date)`,
    // task_id/project_id have no FK on purpose: undoing a task delete brings the link back.
    tx`
      CREATE TABLE IF NOT EXISTS mt.ideas (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES mt.users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        color TEXT NOT NULL DEFAULT '#EC4C9A',
        pinned BOOLEAN NOT NULL DEFAULT FALSE,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        source TEXT NOT NULL DEFAULT 'app',
        task_id TEXT,
        project_id TEXT,
        converted_at BIGINT,
        surfaced_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
    tx`CREATE INDEX IF NOT EXISTS ideas_user_idx ON mt.ideas (user_id, archived)`,
    // v4: pinned tasks float to the top of their list (v3 shipped without the column).
    tx`ALTER TABLE mt.tasks ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE`,
    // v5: the sidebar look ('light' | 'dark'), kept on the account so it follows the user everywhere.
    tx`ALTER TABLE mt.users ADD COLUMN IF NOT EXISTS theme TEXT`,
    // v6: «يومية», a checklist that clears itself every day at 5 AM. An item counts as done when
    // checked_at is after the latest 5 AM (local, worked out on the client); reset clears it.
    tx`
      CREATE TABLE IF NOT EXISTS mt.daily_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES mt.users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        checked_at BIGINT,
        position DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
    tx`CREATE INDEX IF NOT EXISTS daily_items_user_idx ON mt.daily_items (user_id)`,
    tx`
      INSERT INTO mt.meta (key, value) VALUES ('schema_version', ${SCHEMA_VERSION})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  ]);
  await seedAdmin();
}

async function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || 'yazanaboatieh@gmail.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const now = Date.now();
  await sql()`
    INSERT INTO mt.users (id, email, name, password_hash, role, active, created_at, updated_at)
    VALUES (${randomUUID()}, ${email}, '', ${await hashPassword(password)}, 'admin', TRUE, ${now}, ${now})
    ON CONFLICT (email) DO UPDATE SET role = 'admin', active = TRUE`;
}
