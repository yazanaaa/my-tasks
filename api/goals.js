import { sql, ensureSchema, json, readBody } from './_db.js';
import { requireUser } from './_auth.js';

const validProgress = (value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100;

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res);
    if (!session) return;
    const db = sql();
    const { user } = session;
    const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id');
    const body = await readBody(req);

    if (req.method === 'POST') {
      const goal = body.goal;
      const title = String(goal?.title || '').trim();
      if (!goal?.id || !title || title.length > 200 || !validProgress(goal.progress)) {
        return json(res, 400, { error: 'invalid_goal' });
      }
      await db`
        INSERT INTO goals (id, user_id, title, progress, "order", created_at, updated_at)
        VALUES (${goal.id}, ${user.id}, ${title}, ${Number(goal.progress)}, ${Number(goal.order) || 0},
          ${Number(goal.createdAt) || Date.now()}, ${Number(goal.updatedAt) || Date.now()})`;
      return json(res, 201, { ok: true });
    }

    if (!id) return json(res, 400, { error: 'id_required' });
    const current = user.role === 'admin'
      ? await db`SELECT * FROM goals WHERE id = ${id}`
      : await db`SELECT * FROM goals WHERE id = ${id} AND user_id = ${user.id}`;
    if (!current.length) return json(res, 404, { error: 'not_found' });

    if (req.method === 'PATCH') {
      const title = body.title === undefined ? current[0].title : String(body.title).trim();
      const progress = body.progress === undefined ? current[0].progress : Number(body.progress);
      if (!title || title.length > 200 || !validProgress(progress)) return json(res, 400, { error: 'invalid_goal' });
      await db`
        UPDATE goals SET title = ${title}, progress = ${progress}, updated_at = ${Date.now()}
        WHERE id = ${id} AND user_id = ${current[0].user_id}`;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      await db`DELETE FROM goals WHERE id = ${id} AND user_id = ${current[0].user_id}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
