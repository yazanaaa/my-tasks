import { sql, ensureSchema, json, readBody } from './_db.js';
import { requireUser } from './_auth.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res);
    if (!session) return;
    const db = sql();
    const { user } = session;
    const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id');
    const body = req.method === 'GET' ? {} : await readBody(req);

    if (req.method === 'POST') {
      if (body.action === 'reorder' || body.action === 'reset') {
        const lists = user.role === 'admin'
          ? await db`SELECT * FROM lists WHERE id = ${body.listId}`
          : await db`SELECT * FROM lists WHERE id = ${body.listId} AND user_id = ${user.id}`;
        if (!lists.length) return json(res, 404, { error: 'not_found' });
        if (body.action === 'reorder') {
          const ids = Array.isArray(body.ids) ? body.ids : [];
          await Promise.all(ids.map((tid, i) =>
            db`UPDATE tasks SET "order" = ${i} WHERE id = ${tid} AND list_id = ${body.listId} AND user_id = ${lists[0].user_id}`));
        } else {
          await db`
            UPDATE tasks SET status = 'not_started', updated_at = ${Date.now()}
            WHERE list_id = ${body.listId} AND user_id = ${lists[0].user_id} AND status <> 'not_started'`;
        }
        return json(res, 200, { ok: true });
      }

      const t = body.task;
      if (!t?.id || !t?.listId || !String(t.title || '').trim()) return json(res, 400, { error: 'invalid_task' });
      const lists = user.role === 'admin'
        ? await db`SELECT * FROM lists WHERE id = ${t.listId}`
        : await db`SELECT * FROM lists WHERE id = ${t.listId} AND user_id = ${user.id}`;
      if (!lists.length) return json(res, 404, { error: 'not_found' });
      const ownerId = lists[0].user_id;
      await db`
        INSERT INTO tasks (id, list_id, user_id, title, status, "order", created_at, updated_at)
        VALUES (${t.id}, ${t.listId}, ${ownerId}, ${String(t.title).trim()}, ${t.status || 'not_started'},
          ${Number(t.order) || 0}, ${Number(t.createdAt) || Date.now()}, ${Number(t.updatedAt) || Date.now()})`;
      return json(res, 201, { ok: true });
    }

    if (!id) return json(res, 400, { error: 'id_required' });
    const current = user.role === 'admin'
      ? await db`SELECT * FROM tasks WHERE id = ${id}`
      : await db`SELECT * FROM tasks WHERE id = ${id} AND user_id = ${user.id}`;
    if (!current.length) return json(res, 404, { error: 'not_found' });

    if (req.method === 'PATCH') {
      const c = current[0];
      await db`
        UPDATE tasks SET title = ${body.title ?? c.title}, status = ${body.status ?? c.status}, updated_at = ${Date.now()}
        WHERE id = ${id} AND user_id = ${current[0].user_id}`;
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      await db`DELETE FROM tasks WHERE id = ${id} AND user_id = ${current[0].user_id}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
