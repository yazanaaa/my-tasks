import { ensureSchema, sql } from './db.js';
import { HttpError, json, queryParam, readBody, route } from './http.js';
import { requireUser } from './auth.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const RECURRENCE_RE = /^(daily|weekdays|weekly|monthly|yearly|every:\d{1,3}:(day|week|month)|days:[0-6](,[0-6]){0,6})$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_BATCH = 500;

// Field types: each one validates/coerces a client value into the column value.
export const t = {
  text: ({ max = 500, required = false } = {}) => ({
    required,
    parse(v) {
      if (typeof v !== 'string') throw new HttpError(400, 'invalid_field');
      const s = v.trim();
      if (required && !s) throw new HttpError(400, 'invalid_field');
      return s.slice(0, max);
    },
  }),
  longText: () => ({ parse: (v) => (typeof v === 'string' ? v.slice(0, 20000) : fail()) }),
  oneOf: (...values) => ({ parse: (v) => (values.includes(v) ? v : fail()) }),
  color: () => ({ parse: (v) => (COLOR_RE.test(v) ? v : fail()) }),
  int: (min, max) => ({ parse: (v) => (Number.isInteger(v) && v >= min && v <= max ? v : fail()) }),
  float: () => ({ parse: (v) => (typeof v === 'number' && Number.isFinite(v) ? v : fail()) }),
  bool: () => ({ parse: (v) => (typeof v === 'boolean' ? v : fail()) }),
  timestamp: () => ({ parse: (v) => (v === null || (Number.isInteger(v) && v > 0) ? v : fail()) }),
  date: () => ({ parse: (v) => (v === null || DATE_RE.test(v) ? v : fail()) }),
  time: () => ({ parse: (v) => (v === null || TIME_RE.test(v) ? v : fail()) }),
  recurrence: () => ({ parse: (v) => (v === null || RECURRENCE_RE.test(v) ? v : fail()) }),
  tags: () => ({
    parse(v) {
      if (!Array.isArray(v) || v.length > 20) fail();
      return [...new Set(v.map((s) => (typeof s === 'string' ? s.trim().slice(0, 40) : fail())).filter(Boolean))];
    },
  }),
  weekdays: () => ({
    parse(v) {
      if (!Array.isArray(v) || !v.length || v.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) fail();
      return [...new Set(v)].sort();
    },
  }),
  // A reference to another row the same user must own.
  ref: (table, { nullable = true } = {}) => ({
    ref: table,
    parse: (v) => (v === null && nullable ? null : typeof v === 'string' && ID_RE.test(v) ? v : fail()),
  }),
};

function fail() {
  throw new HttpError(400, 'invalid_field');
}

const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export function rowOut(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id') continue;
    out[camel(k)] = k.endsWith('_at') && v !== null ? Number(v) : v;
  }
  return out;
}

function parseFields(fields, body, { creating }) {
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    if (body[key] === undefined) {
      if (creating && field.required) throw new HttpError(400, `${key}_required`);
      continue;
    }
    values[snake(key)] = field.parse(body[key]);
  }
  return values;
}

async function checkRefs(fields, items, userId, table) {
  const creatingIds = new Set(items.map((i) => i.id));
  const byTable = new Map();
  for (const item of items) {
    for (const [key, field] of Object.entries(fields)) {
      const value = item.values[snake(key)];
      if (!field.ref || value == null) continue;
      if (field.ref === table && creatingIds.has(value)) continue;
      if (!byTable.has(field.ref)) byTable.set(field.ref, new Set());
      byTable.get(field.ref).add(value);
    }
  }
  for (const [refTable, ids] of byTable) {
    const list = [...ids];
    const rows = await sql()(`SELECT id FROM mt.${refTable} WHERE user_id = $1 AND id = ANY($2)`, [userId, list]);
    if (rows.length !== list.length) throw new HttpError(400, 'invalid_reference');
  }
}

function insertQuery(db, table, userId, item) {
  const now = Date.now();
  const cols = ['id', 'user_id', 'created_at', 'updated_at', ...Object.keys(item.values)];
  const params = [item.id, userId, item.createdAt ?? now, now, ...Object.values(item.values)];
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
  return db(
    `INSERT INTO mt.${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})
     ON CONFLICT (id) DO NOTHING RETURNING *`,
    params,
  );
}

function updateQuery(db, table, userId, item) {
  const entries = Object.entries(item.values);
  const sets = entries.map(([c], i) => `"${c}" = $${i + 1}`);
  const params = entries.map(([, v]) => v);
  params.push(Date.now(), item.id, userId);
  const n = params.length;
  return db(
    `UPDATE mt.${table} SET ${[...sets, `updated_at = $${n - 2}`].join(', ')}
     WHERE id = $${n - 1} AND user_id = $${n} RETURNING *`,
    params,
  );
}

/**
 * A REST resource scoped to the signed-in user:
 *   POST   {..} | {items:[..]}   create (client supplies ids, idempotent)
 *   PATCH  ?id=  {..}            update one
 *   PATCH  {items:[{id,..}]}     update many atomically (reorder, bulk moves)
 *   DELETE ?id= | {ids:[..]}     delete
 */
export function resource({ table, fields }) {
  return route(async (req, res) => {
    await ensureSchema();
    const { user } = await requireUser(req);
    const db = sql();

    if (req.method === 'DELETE') {
      const one = queryParam(req, 'id');
      const ids = one ? [one] : (await readBody(req)).ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_BATCH || ids.some((id) => typeof id !== 'string')) {
        throw new HttpError(400, 'ids_required');
      }
      await db(`DELETE FROM mt.${table} WHERE user_id = $1 AND id = ANY($2)`, [user.id, ids]);
      return json(res, 200, { ok: true });
    }

    const body = await readBody(req);
    if (req.method !== 'POST' && req.method !== 'PATCH') throw new HttpError(405, 'method_not_allowed');
    const creating = req.method === 'POST';
    const one = queryParam(req, 'id');
    const raw = Array.isArray(body.items) ? body.items : [one ? { ...body, id: one } : body];
    if (!raw.length || raw.length > MAX_BATCH) throw new HttpError(400, 'items_required');

    const items = raw.map((r) => {
      if (typeof r?.id !== 'string' || !ID_RE.test(r.id)) throw new HttpError(400, 'invalid_id');
      return {
        id: r.id,
        createdAt: creating && Number.isInteger(r.createdAt) ? r.createdAt : undefined,
        values: parseFields(fields, r, { creating }),
      };
    });
    await checkRefs(fields, items, user.id, table);

    const run = creating ? insertQuery : updateQuery;
    const work = items.filter((i) => creating || Object.keys(i.values).length);
    const results = work.length === 1
      ? [await run(db, table, user.id, work[0])]
      : work.length ? await db.transaction((tx) => work.map((i) => run(tx, table, user.id, i))) : [];
    const rows = results.flat().map(rowOut);
    return json(res, creating ? 201 : 200, Array.isArray(body.items) ? { items: rows } : { item: rows[0] ?? null });
  });
}
