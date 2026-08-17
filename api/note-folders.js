import { randomUUID } from 'node:crypto';
import { ensureSchema, json, readBody, sql } from './_db.js';
import { requireUser } from './_auth.js';
import { rowToFolder, targetUserId } from './_notes.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res);
    if (!session) return;
    const db = sql();
    const { user } = session;

    if (req.method === 'GET') {
      const ownerId = targetUserId(req, user);
      if (!ownerId) return json(res, 403, { error: 'forbidden' });
      const rows = await db`SELECT * FROM note_folders WHERE user_id = ${ownerId} ORDER BY updated_at DESC`;
      return json(res, 200, { folders: rows.map(rowToFolder) });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 100);
      if (!name) return json(res, 400, { error: 'invalid_name' });
      const now = Date.now();
      const rows = await db`
        INSERT INTO note_folders (id, user_id, name, created_at, updated_at)
        VALUES (${body.id || randomUUID()}, ${user.id}, ${name}, ${now}, ${now})
        RETURNING *`;
      return json(res, 201, { folder: rowToFolder(rows[0]) });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}

