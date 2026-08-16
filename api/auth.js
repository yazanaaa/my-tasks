import { ensureSchema, json, readBody, sql } from './_db.js';
import { getSession, SESSION_TTL, sessionCookie } from './_auth.js';
import { hashToken, newToken, verifyPassword } from './_security.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const db = sql();

    if (req.method === 'GET') {
      const session = await getSession(req);
      if (!session) return json(res, 401, { error: 'unauthorized' });
      return json(res, 200, { user: session.user });
    }

    if (req.method === 'DELETE') {
      const session = await getSession(req);
      if (session) await db`DELETE FROM sessions WHERE token_hash = ${session.tokenHash}`;
      res.setHeader('Set-Cookie', sessionCookie('', 0));
      return json(res, 200, { ok: true });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
    const { email, password } = await readBody(req);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) return json(res, 400, { error: 'email_and_password_required' });

    const users = await db`SELECT * FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
    const adminEmail = String(process.env.ADMIN_EMAIL || 'yazanaboatieh@gmail.com').trim().toLowerCase();
    if (!users.length && normalizedEmail === adminEmail && !process.env.ADMIN_PASSWORD) {
      return json(res, 503, { error: 'admin_not_initialized' });
    }
    const valid = users.length && users[0].active && await verifyPassword(String(password), users[0].password_hash);
    if (!valid) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return json(res, 401, { error: 'invalid_credentials' });
    }

    const token = newToken();
    await db`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      VALUES (${hashToken(token)}, ${users[0].id}, ${Date.now() + SESSION_TTL}, ${Date.now()})`;
    res.setHeader('Set-Cookie', sessionCookie(token));
    return json(res, 200, { user: { id: users[0].id, email: users[0].email, role: users[0].role } });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
