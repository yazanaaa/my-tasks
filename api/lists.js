import { sql, ensureSchema, json, readBody } from './_db.js';
import { requireUser } from './_auth.js';

const rowToList = (r) => ({
  id: r.id, title: r.title, icon: r.icon, color: r.color, recurring: r.recurring,
  pinned: r.pinned, order: r.order, createdAt: Number(r.created_at),
  userId: r.user_id, userEmail: r.user_email,
});
const rowToTask = (r) => ({
  id: r.id, listId: r.list_id, title: r.title, status: r.status, order: r.order,
  createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  userId: r.user_id, userEmail: r.user_email,
});

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res);
    if (!session) return;
    const db = sql();
    const { user } = session;
    const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id');

    if (req.method === 'GET') {
      const lists = user.role === 'admin'
        ? await db`SELECT l.*, u.email AS user_email FROM lists l JOIN users u ON u.id = l.user_id`
        : await db`SELECT l.*, u.email AS user_email FROM lists l JOIN users u ON u.id = l.user_id WHERE l.user_id = ${user.id}`;
      const tasks = user.role === 'admin'
        ? await db`SELECT t.*, u.email AS user_email FROM tasks t JOIN users u ON u.id = t.user_id`
        : await db`SELECT t.*, u.email AS user_email FROM tasks t JOIN users u ON u.id = t.user_id WHERE t.user_id = ${user.id}`;
      return json(res, 200, { lists: lists.map(rowToList), tasks: tasks.map(rowToTask) });
    }

    const body = await readBody(req);
    if (req.method === 'POST') {
      if (body.action === 'reorder') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const stmts = ids.map((rid, i) => user.role === 'admin'
          ? db`UPDATE lists SET "order" = ${i} WHERE id = ${rid}`
          : db`UPDATE lists SET "order" = ${i} WHERE id = ${rid} AND user_id = ${user.id}`);
        await Promise.all(stmts);
        return json(res, 200, { ok: true });
      }
      const l = body.list;
      if (!l?.id || !String(l.title || '').trim()) return json(res, 400, { error: 'invalid_list' });
      await db`
        INSERT INTO lists (id, user_id, title, icon, color, recurring, pinned, "order", created_at)
        VALUES (${l.id}, ${user.id}, ${String(l.title).trim()}, ${l.icon || 'list'}, ${l.color || '#FFD60A'},
          ${Boolean(l.recurring)}, ${Boolean(l.pinned)}, ${Number(l.order) || 0}, ${Number(l.createdAt) || Date.now()})`;
      return json(res, 201, { ok: true });
    }

    if (!id) return json(res, 400, { error: 'id_required' });
    const current = user.role === 'admin'
      ? await db`SELECT * FROM lists WHERE id = ${id}`
      : await db`SELECT * FROM lists WHERE id = ${id} AND user_id = ${user.id}`;
    if (!current.length) return json(res, 404, { error: 'not_found' });

    if (req.method === 'PATCH') {
      const c = current[0];
      await db`
        UPDATE lists SET title = ${body.title ?? c.title}, icon = ${body.icon ?? c.icon},
          color = ${body.color ?? c.color}, recurring = ${body.recurring ?? c.recurring},
          pinned = ${body.pinned ?? c.pinned}
        WHERE id = ${id} AND user_id = ${current[0].user_id}`;
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      await db`DELETE FROM lists WHERE id = ${id} AND user_id = ${current[0].user_id}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
