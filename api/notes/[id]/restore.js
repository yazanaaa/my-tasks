import { ensureSchema, json, sql } from '../../_db.js';
import { requireUser } from '../../_auth.js';
import { requestId, rowToNote } from '../../_notes.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res);
    if (!session) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    const id = requestId(req);
    const rows = await sql()`
      UPDATE notes SET is_deleted = FALSE, deleted_at = NULL, updated_at = ${Date.now()}
      WHERE id = ${id} AND user_id = ${session.user.id} AND is_deleted = TRUE
      RETURNING *`;
    if (!rows.length) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { note: rowToNote(rows[0]) });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}

