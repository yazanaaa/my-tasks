BEGIN;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';

INSERT INTO app_meta (key, value) VALUES ('schema_version', '4')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;
