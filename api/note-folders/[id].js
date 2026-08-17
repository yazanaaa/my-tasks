import { ensureSchema, json, readBody, sql } from '../_db.js';
import { requireUser } from '../_auth.js';
import { requestId, rowToFolder } from '../_notes.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res);
    if (!session) return;
    const db = sql();
    const id = requestId(req);
    const owned = await db`SELECT * FROM note_folders WHERE id = ${id} AND user_id = ${session.user.id}`;
    if (!owned.length) return json(res, 404, { error: 'not_found' });

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 100);
      if (!name) return json(res, 400, { error: 'invalid_name' });
      const rows = await db`
        UPDATE note_folders SET name = ${name}, updated_at = ${Date.now()}
        WHERE id = ${id} AND user_id = ${session.user.id}
        RETURNING *`;
      return json(res, 200, { folder: rowToFolder(rows[0]) });
    }
    if (req.method === 'DELETE') {
      await db`DELETE FROM note_folders WHERE id = ${id} AND user_id = ${session.user.id}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
