import { ensureSchema, sql } from './_lib/db.js';
import { HttpError, json, readBody, route } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST {habitId, date, done}: marks (or unmarks) a habit as done on a given day.
export default route(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  await ensureSchema();
  const { user } = await requireUser(req);
  const { habitId, date, done } = await readBody(req);
  if (typeof habitId !== 'string' || !DATE_RE.test(String(date)) || typeof done !== 'boolean') {
    throw new HttpError(400, 'invalid_field');
  }
  const db = sql();
  if (done) {
    const [habit] = await db`SELECT id FROM mt.habits WHERE id = ${habitId} AND user_id = ${user.id}`;
    if (!habit) throw new HttpError(404, 'not_found');
    await db`
      INSERT INTO mt.habit_logs (habit_id, user_id, date, created_at)
      VALUES (${habitId}, ${user.id}, ${date}, ${Date.now()})
      ON CONFLICT (habit_id, date) DO NOTHING`;
  } else {
    await db`DELETE FROM mt.habit_logs WHERE habit_id = ${habitId} AND user_id = ${user.id} AND date = ${date}`;
  }
  return json(res, 200, { ok: true });
});
