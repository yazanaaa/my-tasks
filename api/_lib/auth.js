import { sql } from './db.js';
import { HttpError } from './http.js';
import { hashToken } from './security.js';

export const SESSION_COOKIE = 'mt_session';
export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
    const i = part.indexOf('=');
    if (i < 0) return ['', ''];
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }).filter(([key]) => key));
}

export function sessionCookie(token, maxAge = Math.floor(SESSION_TTL / 1000)) {
  const secure = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, theme: u.theme ?? null });

export async function getSession(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const rows = await sql()`
    SELECT u.id, u.email, u.name, u.role, u.theme, u.active, s.token_hash
    FROM mt.sessions s
    JOIN mt.users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > ${Date.now()}
    LIMIT 1`;
  if (!rows.length || !rows[0].active) return null;
  return { user: publicUser(rows[0]), tokenHash: rows[0].token_hash };
}

export async function requireUser(req, { admin = false } = {}) {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'unauthorized');
  if (admin && session.user.role !== 'admin') throw new HttpError(403, 'forbidden');
  return session;
}
