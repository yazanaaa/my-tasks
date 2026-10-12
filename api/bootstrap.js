import { ensureSchema, sql } from './_lib/db.js';
import { json, route } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';
import { rowOut } from './_lib/crud.js';

const HISTORY_DAYS = 400;

// Everything the app needs to render, in one round-trip after the session check.
export default route(async (req, res) => {
  await ensureSchema();
  const { user } = await requireUser(req);
  const since = Date.now() - HISTORY_DAYS * 86400000;
  const sinceDate = new Date(since).toISOString().slice(0, 10);
  const [projects, sections, tasks, habits, logs, ideas, daily] = await sql().transaction((tx) => [
    tx`SELECT * FROM mt.projects WHERE user_id = ${user.id} ORDER BY position`,
    tx`SELECT * FROM mt.sections WHERE user_id = ${user.id} ORDER BY position`,
    tx`SELECT * FROM mt.tasks WHERE user_id = ${user.id} AND (completed = FALSE OR completed_at > ${since}) ORDER BY position`,
    tx`SELECT * FROM mt.habits WHERE user_id = ${user.id} ORDER BY position`,
    tx`SELECT habit_id, date FROM mt.habit_logs WHERE user_id = ${user.id} AND date >= ${sinceDate}`,
    tx`SELECT * FROM mt.ideas WHERE user_id = ${user.id} AND (archived = FALSE OR updated_at > ${since}) ORDER BY created_at DESC`,
    tx`SELECT * FROM mt.daily_items WHERE user_id = ${user.id} ORDER BY position`,
  ], { readOnly: true });
  return json(res, 200, {
    user,
    projects: projects.map(rowOut),
    sections: sections.map(rowOut),
    tasks: tasks.map(rowOut),
    habits: habits.map(rowOut),
    habitLogs: logs.map(rowOut),
    ideas: ideas.map(rowOut),
    dailyItems: daily.map(rowOut),
  });
});
