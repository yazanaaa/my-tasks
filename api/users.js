import { randomUUID } from 'node:crypto';
import { ensureSchema, json, readBody, sql } from './_db.js';
import { requireUser } from './_auth.js';
import { hashPassword } from './_security.js';

const publicUser = (u) => ({
  id: u.id, email: u.email, role: u.role, active: u.active,
  createdAt: Number(u.created_at), listsCount: Number(u.lists_count || 0), tasksCount: Number(u.tasks_count || 0),
  goalsCount: Number(u.goals_count || 0), notesCount: Number(u.notes_count || 0),
});
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const session = await requireUser(req, res, { admin: true });
    if (!session) return;
    const db = sql();
    const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id');

    if (req.method === 'GET') {
      const rows = await db`
        SELECT u.*,
          (SELECT COUNT(*) FROM lists l WHERE l.user_id = u.id) AS lists_count,
          (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS tasks_count,
          (SELECT COUNT(*) FROM goals g WHERE g.user_id = u.id) AS goals_count,
          (SELECT COUNT(*) FROM notes n WHERE n.user_id = u.id AND n.is_deleted = FALSE) AS notes_count
        FROM users u ORDER BY u.role ASC, u.created_at ASC`;
      return json(res, 200, { users: rows.map(publicUser) });
    }

    const body = await readBody(req);
    if (req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!validEmail(email)) return json(res, 400, { error: 'invalid_email' });
      if (password.length < 8) return json(res, 400, { error: 'weak_password' });
      const passwordHash = await hashPassword(password);
      let created;
      try {
        const rows = await db`
          INSERT INTO users (id, email, password_hash, role, active, created_at, updated_at)
          VALUES (${randomUUID()}, ${email}, ${passwordHash}, 'user', TRUE, ${Date.now()}, ${Date.now()})
          RETURNING *`;
        created = rows[0];
      } catch (e) {
        if (String(e.message).toLowerCase().includes('unique')) return json(res, 409, { error: 'email_exists' });
        throw e;
      }
      return json(res, 201, { user: publicUser(created) });
    }

    if (!id) return json(res, 400, { error: 'id_required' });
    const target = await db`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    if (!target.length) return json(res, 404, { error: 'not_found' });
    if (target[0].role === 'admin') return json(res, 403, { error: 'admin_protected' });

    if (req.method === 'PATCH') {
      const email = body.email === undefined ? target[0].email : String(body.email).trim().toLowerCase();
      if (!validEmail(email)) return json(res, 400, { error: 'invalid_email' });
      let passwordHash = target[0].password_hash;
      if (body.password) {
        if (String(body.password).length < 8) return json(res, 400, { error: 'weak_password' });
        passwordHash = await hashPassword(String(body.password));
      }
      const active = body.active === undefined ? target[0].active : Boolean(body.active);
      let updated;
      try {
        const rows = await db`
          UPDATE users SET email = ${email}, password_hash = ${passwordHash}, active = ${active}, updated_at = ${Date.now()}
          WHERE id = ${id}
          RETURNING *`;
        updated = rows[0];
      } catch (e) {
        if (String(e.message).toLowerCase().includes('unique')) return json(res, 409, { error: 'email_exists' });
        throw e;
      }
      if (!active || body.password) await db`DELETE FROM sessions WHERE user_id = ${id}`;
      return json(res, 200, { user: publicUser(updated) });
    }

    if (req.method === 'DELETE') {
      await db`DELETE FROM users WHERE id = ${id}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
