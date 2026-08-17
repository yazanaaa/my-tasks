import { randomUUID } from 'node:crypto';
import { ensureSchema, json, readBody, sql } from './_db.js';
import { requireUser } from './_auth.js';
import { boolParam, resolvedTitle, rowToFolder, rowToNote, targetUserId } from './_notes.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res);
    if (!session) return;
    const db = sql();
    const { user } = session;

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const ownerId = targetUserId(req, user);
      if (!ownerId) return json(res, 403, { error: 'forbidden' });
      const includeDeleted = boolParam(url.searchParams.get('include_deleted'));
      const hasFolder = url.searchParams.has('folder_id');
      const rawFolder = url.searchParams.get('folder_id');
      const folderIsNull = rawFolder === 'none' || rawFolder === '';
      const folderId = folderIsNull ? null : rawFolder;
      const search = String(url.searchParams.get('search') || '').trim().slice(0, 200);
      const pattern = `%${search}%`;
      const recentFirst = boolParam(url.searchParams.get('recent'));
      const includeFolders = boolParam(url.searchParams.get('include_folders'));
      const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit')) || 1000));
      const notesPromise = db`
        SELECT * FROM notes
        WHERE user_id = ${ownerId}
          AND (${includeDeleted} OR is_deleted = FALSE)
          AND (${!hasFolder} OR (${folderIsNull} AND folder_id IS NULL) OR folder_id = ${folderId})
          AND (${!search} OR title ILIKE ${pattern} OR content ILIKE ${pattern})
        ORDER BY (CASE WHEN ${recentFirst} THEN FALSE ELSE is_pinned END) DESC, updated_at DESC
        LIMIT ${limit}`;
      const foldersPromise = includeFolders
        ? db`SELECT * FROM note_folders WHERE user_id = ${ownerId} ORDER BY updated_at DESC`
        : Promise.resolve([]);
      const [rows, folders] = await Promise.all([notesPromise, foldersPromise]);
      return json(res, 200, {
        notes: rows.map(rowToNote),
        ...(includeFolders ? { folders: folders.map(rowToFolder) } : {}),
      });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const content = String(body.content || '');
      if (content.length > 1_000_000) return json(res, 413, { error: 'content_too_large' });
      const folderId = body.folderId || null;
      if (folderId) {
        const folder = await db`SELECT id FROM note_folders WHERE id = ${folderId} AND user_id = ${user.id}`;
        if (!folder.length) return json(res, 400, { error: 'invalid_folder' });
      }
      const now = Date.now();
      const rows = await db`
        INSERT INTO notes (id, user_id, folder_id, title, content, is_pinned, is_deleted, created_at, updated_at)
        VALUES (${body.id || randomUUID()}, ${user.id}, ${folderId}, ${resolvedTitle(body.title, content)}, ${content},
          ${Boolean(body.isPinned)}, FALSE, ${now}, ${now})
        RETURNING *`;
      return json(res, 201, { note: rowToNote(rows[0]) });
    }

    return json(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
