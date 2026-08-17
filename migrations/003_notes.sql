BEGIN;

CREATE TABLE IF NOT EXISTS note_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS note_folders_user_idx ON note_folders (user_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES note_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS notes_user_idx ON notes (user_id);
CREATE INDEX IF NOT EXISTS notes_folder_idx ON notes (folder_id);
CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (updated_at DESC);

INSERT INTO app_meta (key, value) VALUES ('schema_version', '3')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;
