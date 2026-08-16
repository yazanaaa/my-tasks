import { sql, json } from './_db.js';
import { hashToken } from './_security.js';

export const SESSION_COOKIE = 'mytasks_session';
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
    const i = part.indexOf('=');
    if (i < 0) return ['', ''];
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }).filter(([key]) => key));
}

export function sessionCookie(token, maxAge = Math.floor(SESSION_TTL / 1000)) {
  const secure = process.env.VERCEL_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function getSession(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const rows = await sql()`
    SELECT u.id, u.email, u.role, u.active, s.token_hash
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > ${Date.now()}
    LIMIT 1`;
  if (!rows.length || !rows[0].active) return null;
  return {
    user: { id: rows[0].id, email: rows[0].email, role: rows[0].role },
    tokenHash: rows[0].token_hash,
  };
}

export async function requireUser(req, res, { admin = false } = {}) {
  const session = await getSession(req);
  if (!session) {
    json(res, 401, { error: 'unauthorized' });
    return null;
  }
  if (admin && session.user.role !== 'admin') {
    json(res, 403, { error: 'forbidden' });
    return null;
  }
  return session;
}

