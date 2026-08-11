import { json, readBody } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  try {
    const { code } = await readBody(req);
    const expected = process.env.ACCESS_CODE || '3323';
    if (String(code) === expected) return json(res, 200, { ok: true });
    await new Promise((r) => setTimeout(r, 700));
    return json(res, 401, { ok: false });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
