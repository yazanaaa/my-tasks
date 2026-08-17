import { ensureSchema, json, readBody, sql } from '../_db.js';
import { requireUser } from '../_auth.js';
import { requestId, resolvedTitle, rowToNote } from '../_notes.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res);
    if (!session) return;
    const db = sql();
    const { user } = session;
    const id = requestId(req);
    if (!id) return json(res, 400, { error: 'id_required' });

    const visible = user.role === 'admin'
      ? await db`SELECT * FROM notes WHERE id = ${id}`
      : await db`SELECT * FROM notes WHERE id = ${id} AND user_id = ${user.id}`;
    if (!visible.length) return json(res, 404, { error: 'not_found' });

    if (req.method === 'GET') return json(res, 200, { note: rowToNote(visible[0]) });

    if (req.method === 'DELETE') {
      await db`
        UPDATE notes SET is_deleted = TRUE, deleted_at = ${Date.now()}, updated_at = ${Date.now()}
        WHERE id = ${id} AND user_id = ${visible[0].user_id}`;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'PATCH') {
      if (visible[0].user_id !== user.id) return json(res, 403, { error: 'read_only' });
      if (visible[0].is_deleted) return json(res, 409, { error: 'note_deleted' });
      const body = await readBody(req);
      const content = body.content === undefined ? visible[0].content : String(body.content);
      if (content.length > 1_000_000) return json(res, 413, { error: 'content_too_large' });
      const folderId = body.folderId === undefined ? visible[0].folder_id : (body.folderId || null);
      if (folderId) {
        const folder = await db`SELECT id FROM note_folders WHERE id = ${folderId} AND user_id = ${user.id}`;
        if (!folder.length) return json(res, 400, { error: 'invalid_folder' });
      }
      const title = body.title === undefined
        ? visible[0].title
        : resolvedTitle(body.title, content);
      const rows = await db`
        UPDATE notes SET folder_id = ${folderId}, title = ${title}, content = ${content},
          is_pinned = ${body.isPinned === undefined ? visible[0].is_pinned : Boolean(body.isPinned)},
          updated_at = ${Date.now()}
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING *`;
      return json(res, 200, { note: rowToNote(rows[0]) });
    }

    return json(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
