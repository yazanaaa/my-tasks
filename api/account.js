import { ensureSchema, sql } from './_lib/db.js';
import { HttpError, json, readBody, route } from './_lib/http.js';
import { publicUser, requireUser } from './_lib/auth.js';
import { hashPassword, verifyPassword } from './_lib/security.js';

// PATCH {name?, currentPassword?, newPassword?}: the signed-in user's own profile.
export default route(async (req, res) => {
  if (req.method !== 'PATCH') throw new HttpError(405, 'method_not_allowed');
  await ensureSchema();
  const { user, tokenHash } = await requireUser(req);
  const body = await readBody(req);
  const db = sql();
  const [row] = await db`SELECT * FROM mt.users WHERE id = ${user.id}`;

  const name = body.name === undefined ? row.name : String(body.name).trim().slice(0, 80);
  let passwordHash = row.password_hash;
  if (body.newPassword !== undefined) {
    if (!await verifyPassword(String(body.currentPassword || ''), row.password_hash)) {
      throw new HttpError(400, 'wrong_password');
    }
    if (String(body.newPassword).length < 8) throw new HttpError(400, 'weak_password');
    passwordHash = await hashPassword(String(body.newPassword));
  }
  const [updated] = await db`
    UPDATE mt.users SET name = ${name}, password_hash = ${passwordHash}, updated_at = ${Date.now()}
    WHERE id = ${user.id} RETURNING *`;
  if (body.newPassword !== undefined) {
    await db`DELETE FROM mt.sessions WHERE user_id = ${user.id} AND token_hash <> ${tokenHash}`;
  }
  return json(res, 200, { user: publicUser(updated) });
});
