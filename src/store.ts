import { create } from 'zustand';
import { api, ApiError, enqueue, newId } from './lib/api';
import { ideasLabel, nextOccurrence, relativeDay } from './lib/dates';
import { cleanIdeaText, extractTags, nextIdeaColor, pickIdeaColor, splitIdea, stripTags } from './lib/ideas';
import {
  clearDraft, forgetUser, lastUserId, readAllDrafts, readOutbox, rememberUser, writeOutbox,
} from './lib/outbox';
import { currentThemeMode, setThemeMode } from './lib/themeMode';
import type { Bootstrap, Habit, Idea, IdeaSource, Project, Section, Task, User } from './types';

type Rec<T> = Record<string, T>;

export interface Toast {
  id: string;
  message: string;
  action?: { label: string; run: () => void };
}

export interface QuickAddDefaults {
  projectId?: string | null;
  sectionId?: string | null;
  dueDate?: string | null;
  text?: string;
}

export interface IdeaCaptureState { text: string; source: IdeaSource; key: number }
export type IdeaPatch = Partial<Pick<Idea,
  'text' | 'color' | 'pinned' | 'archived' | 'surfacedAt' | 'convertedAt' | 'taskId' | 'projectId'>>;

interface State {
  status: 'loading' | 'anon' | 'ready' | 'error';
  user: User | null;
  projects: Rec<Project>;
  sections: Rec<Section>;
  tasks: Rec<Task>;
  habits: Rec<Habit>;
  habitLogs: Rec<true>; // `${habitId}|${date}`
  ideas: Rec<Idea>;
  pendingIdeas: Rec<true>; // ideas still waiting in the outbox after a failed upload
  toasts: Toast[];
  selectedTaskId: string | null;
  selectedIdeaId: string | null;
  quickAdd: QuickAddDefaults | null;
  ideaCapture: IdeaCaptureState | null;
  paletteOpen: boolean;
}

const byId = <T extends { id: string }>(items: T[]): Rec<T> => Object.fromEntries(items.map((i) => [i.id, i]));
const without = <T>(rec: Rec<T>, ids: Set<string>): Rec<T> =>
  Object.fromEntries(Object.entries(rec).filter(([id]) => !ids.has(id)));
export const logKey = (habitId: string, date: string) => `${habitId}|${date}`;

const TASK_FIELDS = [
  'title', 'notes', 'projectId', 'sectionId', 'parentId', 'priority', 'dueDate', 'dueTime',
  'recurrence', 'tags', 'completed', 'completedAt', 'pinned', 'position', 'createdAt',
] as const;
const taskPayload = (t: Task) => ({ id: t.id, ...Object.fromEntries(TASK_FIELDS.map((k) => [k, t[k]])) });

const IDEA_FIELDS = [
  'text', 'tags', 'color', 'pinned', 'archived', 'source', 'taskId', 'projectId', 'convertedAt', 'surfacedAt',
  'createdAt',
] as const;
const ideaPayload = (i: Idea) => ({ id: i.id, ...Object.fromEntries(IDEA_FIELDS.map((k) => [k, i[k]])) });

export const useStore = create<State>()(() => ({
  status: 'loading',
  user: null,
  projects: {},
  sections: {},
  tasks: {},
  habits: {},
  habitLogs: {},
  ideas: {},
  pendingIdeas: {},
  toasts: [],
  selectedTaskId: null,
  selectedIdeaId: null,
  quickAdd: null,
  ideaCapture: null,
  paletteOpen: false,
}));

const set = useStore.setState;
const get = useStore.getState;

/* ---------- Toasts & sync ---------- */

export function toast(message: string, action?: Toast['action']) {
  const id = newId();
  set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, action }] }));
  setTimeout(() => dismissToast(id), action ? 6000 : 3500);
}

export function dismissToast(id: string) {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

function persist(fn: () => Promise<unknown>) {
  enqueue(fn).catch((e) => {
    if (e instanceof ApiError && e.status === 401) {
      set({ status: 'anon', user: null });
      return;
    }
    toast('تعذّر حفظ آخر تغيير، أعدنا مزامنة بياناتك');
    void load();
  });
}

const OFFLINE = 'ما في نت هلأ، أفكارك محفوظة على جهازك';
let firstLoad = true;
let loadSeq = 0;
// Idea changes made while a bootstrap read is in flight are newer than its snapshot, so they win.
let loadTouched: Map<string, Idea | null> | null = null;

export async function load() {
  const seq = ++loadSeq;
  const touched = new Map<string, Idea | null>();
  loadTouched = touched;
  const wasReady = get().status === 'ready';
  try {
    await enqueue(async () => undefined); // let queued writes land before reading
    const data = await api.get<Bootstrap>('bootstrap');
    if (seq !== loadSeq) return; // superseded by a newer load or a logout
    loadTouched = null;
    const uid = data.user.id;
    rememberUser(uid);
    const serverIdeas = data.ideas ?? [];
    const serverIds = new Set(serverIdeas.map((i) => i.id));
    const unsent = readOutbox(uid).filter((i) => !serverIds.has(i.id));
    writeOutbox(uid, unsent);
    const ideas = byId([...serverIdeas, ...unsent]);
    for (const [id, idea] of touched) {
      if (idea) ideas[id] = idea;
      else delete ideas[id];
    }
    // The account's saved look wins over this device's, so it's the same everywhere they sign in.
    if (data.user.theme) setThemeMode(data.user.theme);
    set({
      status: 'ready',
      user: data.user,
      projects: byId(data.projects),
      sections: byId(data.sections),
      tasks: byId(data.tasks),
      habits: byId(data.habits),
      habitLogs: Object.fromEntries(data.habitLogs.map((l) => [logKey(l.habitId, l.date), true])),
      ideas,
      pendingIdeas: Object.fromEntries(unsent.filter((i) => !inflight.has(i.id)).map((i) => [i.id, true])),
    });
    if (firstLoad) {
      firstLoad = false;
      recoverDrafts();
    }
    if (unsent.length) flushOutbox();
  } catch (e) {
    if (seq !== loadSeq) return;
    loadTouched = null;
    if (e instanceof ApiError && e.status === 401) set({ status: 'anon', user: null });
    else if (wasReady) {
      if (!get().toasts.some((t) => t.message === OFFLINE)) toast(OFFLINE);
    } else set({ status: 'error' });
  }
}

/** Cold start only: text typed but never saved (tab killed, crash) becomes an idea. */
function recoverDrafts() {
  const uid = get().user?.id;
  const recovered: Idea[] = [];
  for (const draft of readAllDrafts()) {
    if (!draft.text.trim() || (draft.userId && draft.userId !== uid)) continue;
    // An already open capture sheet (from the offline screen) still owns its draft.
    if (draft.slot === 'capture' && get().ideaCapture) continue;
    const idea = addIdea({ id: draft.id, text: draft.text, source: 'draft' });
    if (!idea) continue;
    clearDraft(draft.slot);
    recovered.push(idea);
  }
  if (!recovered.length) return;
  toast(recovered.length > 1 ? `رجّعنالك ${ideasLabel(recovered.length)} ما كمّلتها` : 'رجّعنالك فكرة ما كمّلتها', {
    label: 'عرض',
    run: () => selectIdea(recovered[0].id),
  });
}

/* ---------- Auth ---------- */

export async function login(email: string, password: string) {
  const { user } = await api.post<{ user: User }>('auth', { email, password });
  rememberUser(user.id);
  await load();
}

export async function logout() {
  await api.del('auth').catch(() => undefined);
  loadSeq += 1; // a bootstrap still in flight belongs to the old session
  loadTouched = null;
  clearDraft('capture');
  clearDraft('composer');
  forgetUser();
  // The outbox stays: it's keyed by user, so it only ever flushes into its own account on their next login.
  set({
    status: 'anon', user: null, projects: {}, sections: {}, tasks: {}, habits: {}, habitLogs: {}, selectedTaskId: null,
    ideas: {}, pendingIdeas: {}, ideaCapture: null, selectedIdeaId: null,
  });
}

export async function updateAccount(patch: { name?: string; currentPassword?: string; newPassword?: string }) {
  const { user } = await api.patch<{ user: User }>('account', patch);
  set({ user });
}

/** Flips the sidebar look on this device right away and saves it on the account. */
export function toggleTheme() {
  const theme = currentThemeMode() === 'dark' ? 'light' : 'dark';
  setThemeMode(theme);
  const user = get().user;
  if (!user) return;
  set({ user: { ...user, theme } });
  persist(() => api.patch('account', { theme }));
}

/* ---------- UI ---------- */

let captureKey = 0;

export const selectTask = (id: string | null) => set({ selectedTaskId: id });
export const openQuickAdd = (defaults: QuickAddDefaults = {}) => set({ quickAdd: defaults, ideaCapture: null });
export const closeQuickAdd = () => set({ quickAdd: null });
export const setPaletteOpen = (paletteOpen: boolean) => set({ paletteOpen });

export function openIdeaCapture(opts?: { text?: string; source?: IdeaSource }) {
  captureKey = Math.max(Date.now(), captureKey + 1); // a fresh key remounts the sheet even within the same ms
  set({
    ideaCapture: { text: typeof opts?.text === 'string' ? opts.text : '', source: opts?.source ?? 'app', key: captureKey },
    quickAdd: null,
    paletteOpen: false,
  });
}
export const closeIdeaCapture = () => set({ ideaCapture: null });
export const selectIdea = (id: string | null) => set({ selectedIdeaId: id });

/* ---------- Tasks ---------- */

export function addTask(input: Partial<Task> & { title: string }): Task {
  const now = Date.now();
  const task: Task = {
    id: newId(),
    notes: '',
    projectId: null,
    sectionId: null,
    parentId: null,
    priority: 0,
    dueDate: null,
    dueTime: null,
    recurrence: null,
    tags: [],
    completed: false,
    completedAt: null,
    pinned: false,
    position: now,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  set((s) => ({ tasks: { ...s.tasks, [task.id]: task } }));
  persist(() => api.post('tasks', taskPayload(task)));
  return task;
}

export function updateTask(id: string, patch: Partial<Task>) {
  const task = get().tasks[id];
  if (!task) return;
  // Moving a task to another project drops its old section (and moves its subtasks along).
  const next: Partial<Task> = { ...patch };
  if (patch.projectId !== undefined && patch.projectId !== task.projectId && patch.sectionId === undefined) {
    next.sectionId = null;
  }
  const subtasks = next.projectId !== undefined && next.projectId !== task.projectId
    ? Object.values(get().tasks).filter((t) => t.parentId === id)
    : [];
  set((s) => {
    const tasks = { ...s.tasks, [id]: { ...task, ...next, updatedAt: Date.now() } };
    for (const st of subtasks) tasks[st.id] = { ...st, projectId: next.projectId ?? null, sectionId: null };
    return { tasks };
  });
  if (subtasks.length) {
    persist(() => api.patch('tasks', {
      items: [{ id, ...next }, ...subtasks.map((st) => ({ id: st.id, projectId: next.projectId ?? null, sectionId: null }))],
    }));
  } else {
    persist(() => api.patch(`tasks?id=${id}`, next));
  }
}

/** Batch move/reorder: [{id, position, sectionId?, dueDate? …}] */
export function moveTasks(items: (Partial<Task> & { id: string })[]) {
  if (!items.length) return;
  set((s) => {
    const tasks = { ...s.tasks };
    for (const { id, ...patch } of items) if (tasks[id]) tasks[id] = { ...tasks[id], ...patch };
    return { tasks };
  });
  persist(() => api.patch('tasks', { items }));
}

export function toggleTask(id: string) {
  const task = get().tasks[id];
  if (!task) return;
  if (task.completed) {
    updateTask(id, { completed: false, completedAt: null });
    return;
  }
  const completedAt = Date.now();
  if (!task.recurrence) {
    updateTask(id, { completed: true, completedAt });
    if (!task.parentId) toast('أُنجزت المهمة', { label: 'تراجع', run: () => updateTask(id, { completed: false, completedAt: null }) });
    return;
  }
  // Recurring: keep this one as history and schedule the next occurrence (with fresh subtasks).
  const nextDue = nextOccurrence(task.recurrence, task.dueDate);
  updateTask(id, { completed: true, completedAt, recurrence: null });
  const next = addTask({ ...task, id: newId(), dueDate: nextDue, completed: false, completedAt: null, createdAt: Date.now() });
  const subtasks = Object.values(get().tasks).filter((t) => t.parentId === id);
  for (const st of subtasks) addTask({ ...st, id: newId(), parentId: next.id, completed: false, completedAt: null });
  toast(`أُنجزت، والموعد القادم ${relativeDay(nextDue)}`, {
    label: 'تراجع',
    run: () => {
      deleteTasks([next.id], { silent: true });
      updateTask(id, { completed: false, completedAt: null, recurrence: task.recurrence });
    },
  });
}

export function deleteTasks(ids: string[], { silent = false } = {}) {
  const all = Object.values(get().tasks);
  const doomed = new Set(ids);
  // Subtasks go with their parent (the database cascades the same way).
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of all) if (t.parentId && doomed.has(t.parentId) && !doomed.has(t.id)) { doomed.add(t.id); grew = true; }
  }
  const removed = all.filter((t) => doomed.has(t.id));
  set((s) => ({
    tasks: without(s.tasks, doomed),
    selectedTaskId: s.selectedTaskId && doomed.has(s.selectedTaskId) ? null : s.selectedTaskId,
  }));
  persist(() => api.del('tasks', { ids }));
  if (silent) return;
  toast(ids.length > 1 ? `حُذفت ${ids.length} مهام` : 'حُذفت المهمة', {
    label: 'تراجع',
    run: () => {
      // Parents first so foreign keys resolve.
      const ordered = [...removed].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
      set((s) => ({ tasks: { ...s.tasks, ...byId(ordered) } }));
      persist(() => api.post('tasks', { items: ordered.map(taskPayload) }));
    },
  });
}

/* ---------- Projects & sections ---------- */

export function addProject(input: Partial<Project> & { name: string }): Project {
  const now = Date.now();
  const project: Project = {
    id: newId(), description: '', color: '#2160B5', icon: 'folder', view: 'list', dueDate: null,
    archived: false, position: now, createdAt: now, updatedAt: now, ...input,
  };
  set((s) => ({ projects: { ...s.projects, [project.id]: project } }));
  const { updatedAt: _u, ...payload } = project;
  persist(() => api.post('projects', payload));
  return project;
}

export function updateProject(id: string, patch: Partial<Project>) {
  set((s) => ({ projects: { ...s.projects, [id]: { ...s.projects[id], ...patch, updatedAt: Date.now() } } }));
  persist(() => api.patch(`projects?id=${id}`, patch));
}

export function deleteProject(id: string) {
  set((s) => {
    const sectionIds = new Set(Object.values(s.sections).filter((x) => x.projectId === id).map((x) => x.id));
    const taskIds = new Set(Object.values(s.tasks).filter((t) => t.projectId === id).map((t) => t.id));
    return {
      projects: without(s.projects, new Set([id])),
      sections: without(s.sections, sectionIds),
      tasks: without(s.tasks, taskIds),
      selectedTaskId: s.selectedTaskId && taskIds.has(s.selectedTaskId) ? null : s.selectedTaskId,
    };
  });
  persist(() => api.del(`projects?id=${id}`));
}

export function reorderProjects(items: { id: string; position: number }[]) {
  set((s) => {
    const projects = { ...s.projects };
    for (const { id, position } of items) projects[id] = { ...projects[id], position };
    return { projects };
  });
  persist(() => api.patch('projects', { items }));
}

export function addSection(projectId: string, name: string, position = Date.now()): Section {
  const now = Date.now();
  const section: Section = { id: newId(), projectId, name, position, createdAt: now, updatedAt: now };
  set((s) => ({ sections: { ...s.sections, [section.id]: section } }));
  persist(() => api.post('sections', { id: section.id, projectId, name, position, createdAt: now }));
  return section;
}

export function updateSection(id: string, patch: Partial<Section>) {
  set((s) => ({ sections: { ...s.sections, [id]: { ...s.sections[id], ...patch } } }));
  persist(() => api.patch(`sections?id=${id}`, patch));
}

export function reorderSections(items: { id: string; position: number }[]) {
  set((s) => {
    const sections = { ...s.sections };
    for (const { id, position } of items) sections[id] = { ...sections[id], position };
    return { sections };
  });
  persist(() => api.patch('sections', { items }));
}

export function deleteSection(id: string) {
  set((s) => {
    const tasks = { ...s.tasks };
    for (const t of Object.values(tasks)) if (t.sectionId === id) tasks[t.id] = { ...t, sectionId: null };
    return { sections: without(s.sections, new Set([id])), tasks };
  });
  persist(() => api.del(`sections?id=${id}`));
}

/* ---------- Habits ---------- */

export function addHabit(input: Partial<Habit> & { name: string }): Habit {
  const now = Date.now();
  const habit: Habit = {
    id: newId(), color: '#E5761A', icon: 'flame', days: [0, 1, 2, 3, 4, 5, 6], archived: false,
    position: now, createdAt: now, updatedAt: now, ...input,
  };
  set((s) => ({ habits: { ...s.habits, [habit.id]: habit } }));
  const { updatedAt: _u, ...payload } = habit;
  persist(() => api.post('habits', payload));
  return habit;
}

export function updateHabit(id: string, patch: Partial<Habit>) {
  set((s) => ({ habits: { ...s.habits, [id]: { ...s.habits[id], ...patch } } }));
  persist(() => api.patch(`habits?id=${id}`, patch));
}

export function deleteHabit(id: string) {
  set((s) => ({
    habits: without(s.habits, new Set([id])),
    habitLogs: Object.fromEntries(Object.entries(s.habitLogs).filter(([k]) => !k.startsWith(`${id}|`))),
  }));
  persist(() => api.del(`habits?id=${id}`));
}

export function toggleHabit(habitId: string, date: string) {
  const key = logKey(habitId, date);
  const done = !get().habitLogs[key];
  set((s) => {
    const habitLogs = { ...s.habitLogs };
    if (done) habitLogs[key] = true;
    else delete habitLogs[key];
    return { habitLogs };
  });
  persist(() => api.post('habit-logs', { habitId, date, done }));
}

/* ---------- Ideas: outbox ---------- */

// New ideas go into a per-user outbox in localStorage and are POSTed from there in batches.
// The server ignores ids it already has, so resending is always safe; an idea leaves the
// outbox only once the server has confirmed it. Edits to synced ideas go through persist().
const inflight = new Set<string>(); // ids whose POST is queued or running
const deletedInFlight = new Set<string>(); // …deleted meanwhile (an undo may have put them back)
const isolate = new Set<string>(); // sent one at a time after the server refused their batch
let flushQueued = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 15_000;

/** Whose outbox is in use: the signed-in user, or on the offline screen the last one on this device. */
const ideaOwner = () => get().user?.id ?? lastUserId();
// Another tab may have signed out or switched accounts: never upload into anyone else's.
const canUpload = (uid: string) => ideaOwner() === uid && (lastUserId() ?? uid) === uid;

function putOutbox(uid: string, items: Idea[]) {
  if (!items.length) return;
  const fresh = new Map(items.map((i) => [i.id, i]));
  const list = readOutbox(uid).map((i) => fresh.get(i.id) ?? i);
  const known = new Set(list.map((i) => i.id));
  writeOutbox(uid, [...list, ...items.filter((i) => !known.has(i.id))]);
}

function dropOutbox(uid: string, ids: Set<string>) {
  const list = readOutbox(uid);
  if (list.some((i) => ids.has(i.id))) writeOutbox(uid, list.filter((i) => !ids.has(i.id)));
}

function putIdeas(list: Idea[]) {
  if (!list.length) return;
  set((s) => ({ ideas: { ...s.ideas, ...byId(list) } }));
  for (const i of list) loadTouched?.set(i.id, i);
}

function removeIdeas(ids: Set<string>) {
  set((s) => ({
    ideas: without(s.ideas, ids),
    pendingIdeas: without(s.pendingIdeas, ids),
    selectedIdeaId: s.selectedIdeaId && ids.has(s.selectedIdeaId) ? null : s.selectedIdeaId,
  }));
  for (const id of ids) loadTouched?.set(id, null);
}

function markPending(ids: string[], pending: boolean) {
  const s = get();
  const change = ids.filter((id) => (pending ? !!s.ideas[id] && !s.pendingIdeas[id] : !!s.pendingIdeas[id]));
  if (!change.length) return;
  const pendingIdeas = { ...s.pendingIdeas };
  for (const id of change) {
    if (pending) pendingIdeas[id] = true;
    else delete pendingIdeas[id];
  }
  set({ pendingIdeas });
}

/** Coalesces rapid-fire and bulk saves into one POST. */
function scheduleFlush() {
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    flushQueued = false;
    flushOutbox();
  });
}

// Failures that aren't "offline" (a flaky connection, a 5xx) fire no browser event, so retry on a timer too.
function retryLater() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    flushOutbox();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 300_000);
}

export function flushOutbox() {
  const uid = ideaOwner();
  if (!uid || !canUpload(uid)) return;
  const ready = readOutbox(uid).filter((i) => !inflight.has(i.id));
  const solo = ready.find((i) => isolate.has(i.id));
  const batch = solo ? [solo] : ready.slice(0, 100);
  if (!batch.length) return;
  const ids = batch.map((i) => i.id);
  for (const id of ids) inflight.add(id);
  const settle = () => {
    const deleted = new Set(ids.filter((id) => deletedInFlight.has(id)));
    for (const id of ids) {
      inflight.delete(id);
      deletedInFlight.delete(id);
    }
    return deleted;
  };
  enqueue(() => (canUpload(uid)
    ? api.post<{ items?: Idea[] }>('ideas', { items: batch.map(ideaPayload) })
    : Promise.resolve(null)))
    .then(
      (res) => {
        const deleted = settle();
        if (res) onIdeasSent(uid, batch, deleted, res.items ?? []);
      },
      (e: unknown) => {
        settle();
        onIdeasFailed(uid, batch, e);
      },
    );
}

function onIdeasSent(uid: string, batch: Idea[], deletedMeanwhile: Set<string>, created: Idea[]) {
  retryDelay = 15_000;
  // An idea deleted (and maybe restored) while this POST ran stays queued: its DELETE came after it.
  const done = new Set(batch.map((i) => i.id).filter((id) => !deletedMeanwhile.has(id)));
  for (const id of done) isolate.delete(id);
  dropOutbox(uid, done);
  markPending([...done], false);
  // A row the server already had came from an earlier attempt whose reply was lost,
  // so it may predate edits made since: bring it up to date.
  const createdIds = new Set(created.map((i) => i.id));
  const existed = [...done].filter((id) => !createdIds.has(id) && get().ideas[id]);
  if (existed.length) {
    persist(() => resyncIdeas(existed, false));
    persist(() => resyncIdeas(existed, true));
  }
  flushRest(uid);
}

function flushRest(uid: string) {
  if (readOutbox(uid).some((i) => !inflight.has(i.id))) scheduleFlush();
}

// Two passes: the content first, which the server can't refuse, then any links, which it refuses
// when the task or project never reached it. Links this device can't see are left as they are.
function resyncIdeas(ids: string[], links: boolean) {
  const { ideas, tasks, projects } = get();
  const items: Rec<unknown>[] = [];
  for (const id of ids) {
    const i = ideas[id];
    if (!i) continue;
    if (!links) {
      items.push({ ...ideaPayload(i), taskId: i.taskId ? undefined : null, projectId: i.projectId ? undefined : null });
      continue;
    }
    const taskId = i.taskId && tasks[i.taskId] ? i.taskId : undefined;
    const projectId = i.projectId && projects[i.projectId] ? i.projectId : undefined;
    if (taskId || projectId) items.push({ id, taskId, projectId });
  }
  return items.length ? api.patch('ideas', { items }) : Promise.resolve();
}

function onIdeasFailed(uid: string, batch: Idea[], e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    if (ideaOwner() === uid) set({ status: 'anon', user: null }); // not if another account signed in meanwhile
    return;
  }
  const queued = new Map(readOutbox(uid).map((i) => [i.id, i]));
  // The newest copy of each idea that hasn't been deleted meanwhile.
  const latest = batch.flatMap((i) => get().ideas[i.id] ?? queued.get(i.id) ?? []);
  if (e instanceof ApiError && e.status === 400) {
    if (e.code === 'invalid_reference' && batch.some((i) => i.taskId || i.projectId)) {
      // The task or project it became never reached the server: keep the idea, drop the link.
      const unlinked = latest.map((i) => ({ ...i, taskId: null, projectId: null }));
      putIdeas(unlinked.filter((i) => get().ideas[i.id]));
      putOutbox(uid, unlinked);
      scheduleFlush();
      return;
    }
    if (batch.length > 1) {
      // Retry one by one so only the idea the server refuses is affected.
      for (const i of batch) isolate.add(i.id);
      scheduleFlush();
      return;
    }
    const ids = new Set(batch.map((i) => i.id));
    for (const id of ids) isolate.delete(id);
    dropOutbox(uid, ids);
    removeIdeas(ids);
    const text = latest.map((i) => i.text).join('\n\n');
    if (text) toast('تعذّر حفظ الفكرة', { label: 'رجّعها', run: () => openIdeaCapture({ text }) });
    flushRest(uid);
    return;
  }
  // Offline, timeout, 5xx…: keep them queued (a load may have dropped one that looked synced) and retry later.
  putOutbox(uid, latest);
  markPending(latest.map((i) => i.id), true);
  retryLater();
}

/* ---------- Ideas ---------- */

function newIdea(text: string, source: IdeaSource, color: string, createdAt: number, id = newId()): Idea {
  return {
    id, text, tags: extractTags(text), color, pinned: false, archived: false, source,
    taskId: null, projectId: null, convertedAt: null, surfacedAt: null, createdAt, updatedAt: Date.now(),
  };
}

function queueIdeas(uid: string, list: Idea[]) {
  putIdeas(list);
  putOutbox(uid, list);
  scheduleFlush();
}

/** Saves an idea locally first, then uploads it. Passing the same id again never makes a second idea. */
export function addIdea(input: { text: string; source?: IdeaSource; id?: string; color?: string; createdAt?: number }): Idea | null {
  const text = cleanIdeaText(input.text);
  const uid = ideaOwner();
  if (!text || !uid) return null;
  const existing = input.id ? get().ideas[input.id] : undefined;
  if (existing) {
    if (existing.text !== text) updateIdea(existing.id, { text });
    return get().ideas[existing.id] ?? existing;
  }
  const idea = newIdea(
    text,
    input.source ?? 'app',
    input.color ?? pickIdeaColor(text, Object.values(get().ideas)),
    input.createdAt ?? Date.now(),
    input.id,
  );
  queueIdeas(uid, [idea]);
  return idea;
}

/** Bulk import: the first text ends up newest, and colours keep rotating in order. */
export function addIdeas(texts: string[], source: IdeaSource = 'import'): Idea[] {
  const uid = ideaOwner();
  if (!uid) return [];
  const now = Date.now();
  const existing = Object.values(get().ideas);
  const list: Idea[] = [];
  // Oldest first, so the rotation runs forward in time like single saves do.
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    const text = cleanIdeaText(texts[i]);
    if (!text) continue;
    const prev = list[list.length - 1];
    const color = prev ? nextIdeaColor(text, prev.color) : pickIdeaColor(text, existing);
    list.push(newIdea(text, source, color, now - i));
  }
  if (!list.length) return [];
  queueIdeas(uid, list);
  toast(`انحفظت ${ideasLabel(list.length)}`);
  return list.reverse();
}

export function updateIdea(id: string, patch: IdeaPatch) {
  const idea = get().ideas[id];
  if (!idea) return;
  const next: Partial<Idea> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (patch.text !== undefined) {
    const text = cleanIdeaText(patch.text);
    if (!text) return;
    next.text = text;
    next.tags = extractTags(text);
  }
  const updated: Idea = { ...idea, ...next, updatedAt: Date.now() };
  putIdeas([updated]);
  const uid = ideaOwner();
  if (uid && readOutbox(uid).some((i) => i.id === id)) {
    // Not on the server yet: the queued copy carries the change. If its POST is already running,
    // the PATCH below (queued after it) covers the change too.
    putOutbox(uid, [updated]);
    if (!inflight.has(id)) {
      scheduleFlush();
      return;
    }
  }
  persist(() => api.patch(`ideas?id=${id}`, next));
}

export function archiveIdea(id: string, archived = true) {
  updateIdea(id, { archived });
  if (archived) toast('انأرشفت الفكرة', { label: 'تراجع', run: () => updateIdea(id, { archived: false }) });
  else toast('رجعت الفكرة');
}

export function deleteIdeas(ids: string[], { silent = false }: { silent?: boolean } = {}) {
  const removed = ids.map((id) => get().ideas[id]).filter((i): i is Idea => !!i);
  if (!removed.length) return;
  const doomed = new Set(ids);
  for (const id of ids) {
    if (inflight.has(id)) deletedInFlight.add(id);
    isolate.delete(id);
  }
  removeIdeas(doomed);
  const uid = ideaOwner();
  if (uid) dropOutbox(uid, doomed);
  persist(() => api.del('ideas', { ids }));
  if (silent) return;
  toast(removed.length > 1 ? `انحذفت ${ideasLabel(removed.length)}` : 'انحذفت الفكرة', {
    label: 'تراجع',
    run: () => restoreIdeas(removed, uid),
  });
}

/** Undo for a delete: re-creates the ideas through the outbox, minus links to things since deleted. */
function restoreIdeas(snapshot: Idea[], uid: string | null) {
  if (!uid || ideaOwner() !== uid) return;
  const { tasks, projects } = get();
  queueIdeas(uid, snapshot.map((i) => ({
    ...i,
    taskId: i.taskId && tasks[i.taskId] ? i.taskId : null,
    projectId: i.projectId && projects[i.projectId] ? i.projectId : null,
  })));
}

export function ideaToTask(id: string): Task | null {
  const idea = get().ideas[id];
  if (!idea) return null;
  const { title, body } = splitIdea(idea.text);
  // Created first, so its POST lands before the idea's link to it.
  const task = addTask({ title: stripTags(title).slice(0, 500), notes: body, tags: idea.tags });
  updateIdea(id, { convertedAt: Date.now(), taskId: task.id, projectId: null });
  set({ selectedIdeaId: null, selectedTaskId: task.id });
  toast('صارت الفكرة مهمة بالوارد');
  return task;
}

/** The caller navigates to the new project. */
export function ideaToProject(id: string): Project | null {
  const idea = get().ideas[id];
  if (!idea) return null;
  const { title, body } = splitIdea(idea.text);
  const project = addProject({
    name: stripTags(title).slice(0, 120), description: body, color: idea.color, icon: 'lightbulb',
  });
  updateIdea(id, { convertedAt: Date.now(), projectId: project.id, taskId: null });
  set({ selectedIdeaId: null });
  toast('صارت الفكرة مشروع');
  return project;
}

export function unconvertIdea(id: string) {
  updateIdea(id, { convertedAt: null, taskId: null, projectId: null });
  toast('رجعت الفكرة للأفكار');
}

export function sparkAction(id: string, action: 'task' | 'pin' | 'archive' | 'later') {
  const now = Date.now();
  if (action === 'task') {
    ideaToTask(id);
    updateIdea(id, { surfacedAt: now });
  } else if (action === 'pin') {
    updateIdea(id, { pinned: true, surfacedAt: now });
    toast('تثبّتت الفكرة');
  } else if (action === 'archive') {
    updateIdea(id, { surfacedAt: now });
    archiveIdea(id);
  } else {
    updateIdea(id, { surfacedAt: now });
  }
}
