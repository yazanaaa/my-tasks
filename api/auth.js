import { ensureSchema, sql } from './_lib/db.js';
import { HttpError, json, readBody, route } from './_lib/http.js';
import { getSession, publicUser, SESSION_TTL, sessionCookie } from './_lib/auth.js';
import { hashToken, newToken, verifyPassword } from './_lib/security.js';

export default route(async (req, res) => {
  await ensureSchema();
  const db = sql();

  if (req.method === 'GET') {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, 'unauthorized');
    return json(res, 200, { user: session.user });
  }

  if (req.method === 'DELETE') {
    const session = await getSession(req);
    if (session) await db`DELETE FROM mt.sessions WHERE token_hash = ${session.tokenHash}`;
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    return json(res, 200, { ok: true });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const { email, password } = await readBody(req);
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !password) throw new HttpError(400, 'email_and_password_required');

  const [user] = await db`SELECT * FROM mt.users WHERE email = ${normalized} LIMIT 1`;
  const valid = user?.active && await verifyPassword(String(password), user.password_hash);
  if (!valid) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    throw new HttpError(401, 'invalid_credentials');
  }

  const token = newToken();
  const now = Date.now();
  await db.transaction((tx) => [
    tx`DELETE FROM mt.sessions WHERE expires_at < ${now}`,
    tx`INSERT INTO mt.sessions (token_hash, user_id, expires_at, created_at)
       VALUES (${hashToken(token)}, ${user.id}, ${now + SESSION_TTL}, ${now})`,
  ]);
  res.setHeader('Set-Cookie', sessionCookie(token));
  return json(res, 200, { user: publicUser(user) });
});
