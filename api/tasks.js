import { sql, ensureSchema, json, readBody } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const db = sql();
    const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id');

    const body = req.method === 'GET' ? {} : await readBody(req);

    if (req.method === 'POST') {
      if (body.action === 'reorder') {
        const stmts = body.ids.map((tid, i) =>
          db`UPDATE tasks SET "order" = ${i} WHERE id = ${tid} AND list_id = ${body.listId}`);
        await Promise.all(stmts);
        return json(res, 200, { ok: true });
      }
      if (body.action === 'reset') {
        await db`
          UPDATE tasks SET status = 'not_started', updated_at = ${Date.now()}
          WHERE list_id = ${body.listId} AND status <> 'not_started'`;
        return json(res, 200, { ok: true });
      }
      const t = body.task;
      await db`
        INSERT INTO tasks (id, list_id, title, status, "order", created_at, updated_at)
        VALUES (${t.id}, ${t.listId}, ${t.title}, ${t.status}, ${t.order}, ${t.createdAt}, ${t.updatedAt})`;
      return json(res, 201, { ok: true });
    }

    if (req.method === 'PATCH' && id) {
      const { title, status } = body;
      const current = await db`SELECT * FROM tasks WHERE id = ${id}`;
      if (!current.length) return json(res, 404, { error: 'not found' });
      const c = current[0];
      await db`
        UPDATE tasks SET
          title = ${title ?? c.title},
          status = ${status ?? c.status},
          updated_at = ${Date.now()}
        WHERE id = ${id}`;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'DELETE' && id) {
      await db`DELETE FROM tasks WHERE id = ${id}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
