// Data layer — the only file that touches persistence.
// Primary: Neon Postgres via /api/* (Vercel serverless functions).
// Authentication and ownership are enforced by the API; there is no unauthenticated fallback.

const STORAGE_KEY = 'mytasks.v1';

let state = { lists: [], tasks: [], goals: [] };
let backend = null; // 'api' | 'local'
let currentUser = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

/* ---------- LocalStorage (fallback) ---------- */

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.lists) && Array.isArray(s.tasks)) return s;
    }
  } catch (e) { /* corrupted data — start fresh */ }
  return { lists: [], tasks: [] };
}

function persistLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

/* ---------- API ---------- */

async function api(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const error = new Error(`API ${method} ${path} failed: ${res.status}`);
    error.status = res.status;
    try { error.data = await res.json(); } catch (e) { /* no JSON body */ }
    throw error;
  }
  return res.json();
}

// Fire-and-forget sync; the local cache is already updated optimistically.
function sync(promise) {
  promise.catch((e) => {
    console.error('فشل المزامنة مع قاعدة البيانات:', e);
    if (e.status === 401) window.dispatchEvent(new CustomEvent('auth-required'));
  });
}

const byPinThenOrder = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.order - b.order;
const byOrder = (a, b) => a.order - b.order;

export const store = {
  setCurrentUser(user) {
    currentUser = user;
  },

  async init() {
    const data = await api('/api/lists', 'GET');
    state = { lists: data.lists || [], tasks: data.tasks || [], goals: data.goals || [] };
    backend = 'api';
    // Remove the legacy shared-device cache; authenticated data must remain server-scoped.
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    emit();
  },

  get lists() {
    return [...state.lists].sort(byPinThenOrder);
  },

  allTasks() {
    return [...state.tasks];
  },

  get goals() {
    return [...state.goals].sort(byOrder);
  },

  tasksOf(listId) {
    return state.tasks.filter((t) => t.listId === listId).sort(byOrder);
  },

  getList(id) {
    return state.lists.find((l) => l.id === id);
  },

  getTask(id) {
    return state.tasks.find((t) => t.id === id);
  },

  getGoal(id) {
    return state.goals.find((g) => g.id === id);
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  addList({ title, color, icon, recurring = false }) {
    const list = {
      id: crypto.randomUUID(),
      title,
      color,
      icon,
      recurring,
      pinned: false,
      order: state.lists.length,
      createdAt: Date.now(),
      userId: currentUser?.id,
      userEmail: currentUser?.email,
    };
    state.lists.push(list);
    if (backend === 'api') sync(api('/api/lists', 'POST', { list }));
    else persistLocal();
    emit();
  },

  updateList(id, patch) {
    const l = state.lists.find((x) => x.id === id);
    if (!l) return;
    Object.assign(l, patch);
    if (backend === 'api') sync(api(`/api/lists?id=${id}`, 'PATCH', patch));
    else persistLocal();
    emit();
  },

  deleteList(id) {
    state.lists = state.lists.filter((l) => l.id !== id);
    state.tasks = state.tasks.filter((t) => t.listId !== id);
    if (backend === 'api') sync(api(`/api/lists?id=${id}`, 'DELETE'));
    else persistLocal();
    emit();
  },

  reorderLists(ids) {
    ids.forEach((id, i) => {
      const l = state.lists.find((x) => x.id === id);
      if (l) l.order = i;
    });
    if (backend === 'api') sync(api('/api/lists', 'POST', { action: 'reorder', ids }));
    else persistLocal();
    emit();
  },

  addTask(listId, title) {
    const task = {
      id: crypto.randomUUID(),
      listId,
      title,
      status: 'not_started',
      order: state.tasks.filter((t) => t.listId === listId).length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.tasks.push(task);
    if (backend === 'api') sync(api('/api/tasks', 'POST', { task }));
    else persistLocal();
    emit();
  },

  updateTask(id, patch) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch, { updatedAt: Date.now() });
    if (backend === 'api') sync(api(`/api/tasks?id=${id}`, 'PATCH', patch));
    else persistLocal();
    emit();
  },

  deleteTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    if (backend === 'api') sync(api(`/api/tasks?id=${id}`, 'DELETE'));
    else persistLocal();
    emit();
  },

  reorderTasks(listId, ids) {
    ids.forEach((id, i) => {
      const t = state.tasks.find((x) => x.id === id && x.listId === listId);
      if (t) t.order = i;
    });
    if (backend === 'api') sync(api('/api/tasks', 'POST', { action: 'reorder', listId, ids }));
    else persistLocal();
    emit();
  },

  resetListTasks(listId) {
    state.tasks.forEach((t) => {
      if (t.listId === listId && t.status !== 'not_started') {
        t.status = 'not_started';
        t.updatedAt = Date.now();
      }
    });
    if (backend === 'api') sync(api('/api/tasks', 'POST', { action: 'reset', listId }));
    else persistLocal();
    emit();
  },

  addGoal(title, progress) {
    const goal = {
      id: crypto.randomUUID(),
      title,
      progress,
      order: state.goals.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: currentUser?.id,
    };
    state.goals.push(goal);
    sync(api('/api/goals', 'POST', { goal }));
    emit();
  },

  updateGoal(id, patch) {
    const goal = state.goals.find((g) => g.id === id);
    if (!goal) return;
    Object.assign(goal, patch, { updatedAt: Date.now() });
    sync(api(`/api/goals?id=${encodeURIComponent(id)}`, 'PATCH', patch));
    emit();
  },

  deleteGoal(id) {
    state.goals = state.goals.filter((g) => g.id !== id);
    sync(api(`/api/goals?id=${encodeURIComponent(id)}`, 'DELETE'));
    emit();
  },
};
