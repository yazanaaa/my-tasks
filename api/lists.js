import { sql, ensureSchema, json, readBody } from './_db.js';

const rowToList = (r) => ({
  id: r.id,
  title: r.title,
  icon: r.icon,
  color: r.color,
  recurring: r.recurring,
  pinned: r.pinned,
  order: r.order,
  createdAt: Number(r.created_at),
});

const rowToTask = (r) => ({
  id: r.id,
  listId: r.list_id,
  title: r.title,
  status: r.status,
  order: r.order,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const db = sql();
    const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id');

    if (req.method === 'GET') {
      const [lists, tasks] = await Promise.all([
        db`SELECT * FROM lists`,
        db`SELECT * FROM tasks`,
      ]);
      return json(res, 200, { lists: lists.map(rowToList), tasks: tasks.map(rowToTask) });
    }

    const body = await readBody(req);

    if (req.method === 'POST') {
      if (body.action === 'reorder') {
        const stmts = body.ids.map((rid, i) => db`UPDATE lists SET "order" = ${i} WHERE id = ${rid}`);
        await Promise.all(stmts);
        return json(res, 200, { ok: true });
      }
      const l = body.list;
      await db`
        INSERT INTO lists (id, title, icon, color, recurring, pinned, "order", created_at)
        VALUES (${l.id}, ${l.title}, ${l.icon}, ${l.color}, ${l.recurring}, ${l.pinned}, ${l.order}, ${l.createdAt})`;
      return json(res, 201, { ok: true });
    }

    if (req.method === 'PATCH' && id) {
      const { title, icon, color, recurring, pinned } = body;
      const current = await db`SELECT * FROM lists WHERE id = ${id}`;
      if (!current.length) return json(res, 404, { error: 'not found' });
      const c = current[0];
      await db`
        UPDATE lists SET
          title = ${title ?? c.title},
          icon = ${icon ?? c.icon},
          color = ${color ?? c.color},
          recurring = ${recurring ?? c.recurring},
          pinned = ${pinned ?? c.pinned}
        WHERE id = ${id}`;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'DELETE' && id) {
      await db`DELETE FROM lists WHERE id = ${id}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
