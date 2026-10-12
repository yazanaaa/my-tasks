import { randomUUID } from 'node:crypto';
import { ensureSchema, sql } from './_lib/db.js';
import { HttpError, json, queryParam, readBody, route } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';
import { hashPassword } from './_lib/security.js';

const out = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, active: u.active,
  createdAt: Number(u.created_at), tasksCount: Number(u.tasks_count || 0),
});
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function uniqueViolation(e) {
  if (String(e.message).toLowerCase().includes('unique')) throw new HttpError(409, 'email_exists');
  throw e;
}

// Admin-only user management.
export default route(async (req, res) => {
  await ensureSchema();
  await requireUser(req, { admin: true });
  const db = sql();

  if (req.method === 'GET') {
    const rows = await db`
      SELECT u.*, (SELECT COUNT(*) FROM mt.tasks t WHERE t.user_id = u.id) AS tasks_count
      FROM mt.users u ORDER BY u.role ASC, u.created_at ASC`;
    return json(res, 200, { users: rows.map(out) });
  }

  const body = await readBody(req);
  if (req.method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!validEmail(email)) throw new HttpError(400, 'invalid_email');
    if (password.length < 8) throw new HttpError(400, 'weak_password');
    const now = Date.now();
    const name = String(body.name || '').trim().slice(0, 80);
    const [created] = await db`
      INSERT INTO mt.users (id, email, name, password_hash, role, active, created_at, updated_at)
      VALUES (${randomUUID()}, ${email}, ${name}, ${await hashPassword(password)}, 'user', TRUE, ${now}, ${now})
      RETURNING *`.catch(uniqueViolation);
    return json(res, 201, { user: out(created) });
  }

  const id = queryParam(req, 'id');
  if (!id) throw new HttpError(400, 'id_required');
  const [target] = await db`SELECT * FROM mt.users WHERE id = ${id} LIMIT 1`;
  if (!target) throw new HttpError(404, 'not_found');
  if (target.role === 'admin') throw new HttpError(403, 'admin_protected');

  if (req.method === 'PATCH') {
    const email = body.email === undefined ? target.email : String(body.email).trim().toLowerCase();
    if (!validEmail(email)) throw new HttpError(400, 'invalid_email');
    const name = body.name === undefined ? target.name : String(body.name).trim().slice(0, 80);
    let passwordHash = target.password_hash;
    if (body.password) {
      if (String(body.password).length < 8) throw new HttpError(400, 'weak_password');
      passwordHash = await hashPassword(String(body.password));
    }
    const active = body.active === undefined ? target.active : Boolean(body.active);
    const [updated] = await db`
      UPDATE mt.users SET email = ${email}, name = ${name}, password_hash = ${passwordHash},
        active = ${active}, updated_at = ${Date.now()}
      WHERE id = ${id} RETURNING *`.catch(uniqueViolation);
    if (!active || body.password) await db`DELETE FROM mt.sessions WHERE user_id = ${id}`;
    return json(res, 200, { user: out(updated) });
  }

  if (req.method === 'DELETE') {
    await db`DELETE FROM mt.users WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }
  throw new HttpError(405, 'method_not_allowed');
});
