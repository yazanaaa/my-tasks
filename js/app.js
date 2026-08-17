import { store } from './store.js';
import { LIST_COLORS, LIST_ICONS, STATUSES, STATUS_ORDER } from './constants.js';
import { makeSortable } from './dnd.js';
import { createNotesApp } from './notes.js';

const headerEl = document.getElementById('header');
const mainEl = document.getElementById('main');
const overlayRoot = document.getElementById('overlay-root');

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
const refreshIcons = () => window.lucide?.createIcons();
const currentUserName = () => currentUser?.email?.split('@')[0] || 'بك';

let searchOpen = false;
let searchQuery = '';
let filter = 'all';
let completedOpen = false;
let currentUser = null;
let adminUsers = [];
let recentNotes = [];
let recentNotesReady = false;
let recentNotesLoading = null;

const notePlainText = (html = '') => {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

async function loadRecentNotes(force = false) {
  if (!currentUser) return;
  if (recentNotesReady && !force) return;
  if (recentNotesLoading) return recentNotesLoading;
  recentNotesLoading = fetch('/api/notes?recent=true&include_deleted=true&include_folders=true')
    .then(async (response) => {
      if (!response.ok) throw new Error('notes_load_failed');
      const data = await response.json();
      recentNotes = (data.notes || []).filter((note) => !note.isDeleted).slice(0, 3);
      notesApp.hydrate(data);
      recentNotesReady = true;
    })
    .catch(() => {
      recentNotes = [];
      recentNotesReady = true;
    })
    .finally(() => { recentNotesLoading = null; });
  return recentNotesLoading;
}

const notesApp = createNotesApp({
  headerEl,
  mainEl,
  overlayRoot,
  getCurrentUser: () => currentUser,
  getAdminUser: (id) => adminUsers.find((user) => user.id === id),
  onExit: () => { location.hash = ''; },
});

/* ---------------- Routing ---------------- */

function currentRoute() {
  if (location.hash === '#/users' && currentUser?.role === 'admin') return { view: 'users' };
  if (location.hash === '#/notes') return { view: 'notes', userId: null };
  const activeNote = location.hash.match(/^#\/notes\/note\/([^/]+)$/);
  if (activeNote) return { view: 'notes', userId: null, noteId: decodeURIComponent(activeNote[1]) };
  const notesUser = location.hash.match(/^#\/notes\/user\/(.+)$/);
  if (notesUser && currentUser?.role === 'admin') return { view: 'notes', userId: notesUser[1] };
  const m = location.hash.match(/^#\/list\/(.+)$/);
  if (m && store.getList(m[1])) return { view: 'list', id: m[1] };
  return { view: 'home' };
}

function render() {
  const activeId = document.activeElement?.id;
  const r = currentRoute();
  if (r.view === 'notes') {
    notesApp.open({ targetUserId: r.userId, activeNoteId: r.noteId }).catch((error) => {
      console.error(error);
      mainEl.innerHTML = '<p class="muted center pad">تعذر تحميل الملاحظات.</p>';
    });
    return;
  }
  if (r.view === 'list') renderListView(r.id);
  else if (r.view === 'users') renderUsers();
  else renderHome();
  refreshIcons();
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length);
    }
  }
}

/* ---------------- Home (lists) ---------------- */

function listCard(l) {
  const tasks = store.tasksOf(l.id);
  const done = tasks.filter((t) => t.status === 'completed').length;
  const pct = tasks.length ? (done / tasks.length) * 100 : 0;
  return `
    <article class="list-card" data-id="${l.id}">
      <div class="card-top">
        <span class="list-icon" style="--c:${l.color}"><i data-lucide="${l.icon}"></i></span>
        <span class="card-top-actions">
          ${l.pinned ? '<span class="pin-ico" title="مثبتة"><i data-lucide="pin"></i></span>' : ''}
          <button class="icon-btn subtle" data-card-menu="${l.id}" aria-label="خيارات القائمة"><i data-lucide="more-horizontal"></i></button>
        </span>
      </div>
      <h3 class="list-title">${esc(l.title)}</h3>
      <p class="list-count">${l.recurring ? '<i data-lucide="repeat" class="repeat-ico"></i>' : ''}${tasks.length ? `${done} من ${tasks.length} مكتملة` : 'لا توجد مهام'}</p>
      <div class="card-bottom">
        <div class="progress"><div class="progress-fill" style="width:${pct}%;--c:${l.color}"></div></div>
        <span class="drag-handle card-drag" aria-label="إعادة ترتيب"><i data-lucide="grip-vertical"></i></span>
      </div>
    </article>`;
}

function goalColor(progress) {
  if (progress >= 100) return '#30D158';
  if (progress >= 70) return '#FFD60A';
  if (progress >= 40) return '#FF9F0A';
  return '#64D2FF';
}

function goalCard(goal) {
  const progress = Math.max(0, Math.min(100, Number(goal.progress) || 0));
  const color = goalColor(progress);
  const complete = progress === 100;
  return `
    <article class="goal-card ${complete ? 'complete' : ''}" style="--goal-color:${color};--goal-progress:${progress}">
      <div class="goal-card-header">
        <span class="goal-symbol"><i data-lucide="target"></i></span>
        <div class="goal-heading-copy">
          <h3>${esc(goal.title)}</h3>
          <span>الهدف</span>
        </div>
        <button class="icon-btn subtle sm" data-goal-menu="${goal.id}" aria-label="خيارات الهدف"><i data-lucide="more-horizontal"></i></button>
      </div>
      <div class="goal-value-row" aria-label="نسبة الإنجاز ${progress}%">
        <strong class="goal-percent">${progress}<small>%</small></strong>
        <span class="goal-state ${complete ? 'done' : ''}">${complete ? '<i data-lucide="check"></i> مكتمل' : 'نسبة الإنجاز'}</span>
      </div>
      <div class="goal-progress-track" aria-hidden="true"><div style="width:${progress}%"></div></div>
      <div class="goal-card-status">
        <span>التقدّم الحالي</span>
        <strong>${complete ? 'تم إنجاز الهدف' : `${100 - progress}% متبقية`}</strong>
      </div>
    </article>`;
}

function goalsSection() {
  const goals = store.goals;
  return `
    <section class="goals-section" aria-labelledby="goals-title">
      <div class="goals-heading">
        <div><span class="goals-kicker">تقدّمك</span><h2 id="goals-title">الأهداف</h2></div>
        <span class="goals-count">${goals.length}</span>
      </div>
      <div class="goals-grid">
        ${goals.map(goalCard).join('')}
        <button class="add-goal-card" data-action="new-goal">
          <span class="add-goal-mark"><i data-lucide="plus"></i></span>
          <span class="add-goal-copy"><strong>إضافة هدف</strong><small>إنشاء هدف جديد</small></span>
        </button>
      </div>
    </section>`;
}

function homeNotesSection() {
  const cards = recentNotes.map((note) => {
    const preview = notePlainText(note.content);
    return `
      <button class="home-note-card" data-action="open-note" data-id="${note.id}">
        <span class="home-note-top">
          <span class="home-note-icon"><i data-lucide="notebook-pen"></i></span>
          <span class="home-note-more"><i data-lucide="more-horizontal"></i></span>
        </span>
        <span class="home-note-copy">
          <strong>${esc(note.title || 'ملاحظة جديدة')}</strong>
          <small>${esc(preview || 'لا يوجد نص بعد')}</small>
        </span>
        <span class="home-note-bottom">
          <span class="home-note-line"></span>
          ${note.isPinned ? '<i class="home-note-pin" data-lucide="pin"></i>' : '<i data-lucide="grip-vertical"></i>'}
        </span>
      </button>`;
  }).join('');
  return `
    <section class="shortcuts-section" aria-labelledby="home-notes-title">
      <div class="shortcuts-heading home-notes-heading">
        <div><span class="shortcuts-kicker">آخر ما كتبت</span><h2 id="home-notes-title">الملاحظات</h2></div>
        <button class="btn-accent" data-action="new-home-note"><i data-lucide="plus"></i><span class="btn-text">إضافة ملاحظة</span></button>
      </div>
      <div class="home-notes-grid">
        ${!recentNotesReady ? '<div class="home-notes-status">جارٍ تحميل الملاحظات…</div>' : cards || '<div class="home-notes-status">لا توجد ملاحظات بعد. أضف أول ملاحظة من هنا.</div>'}
      </div>
      ${recentNotes.length ? '<button class="home-notes-all" data-action="open-notes">عرض كل الملاحظات <i data-lucide="arrow-left"></i></button>' : ''}
    </section>`;
}

function renderHome() {
  const lists = store.lists;

  headerEl.innerHTML = `
    <div class="header-inner">
      <div class="app-brand">
        <h1 class="app-title"><span class="logo-dot"></span>مهامي</h1>
        <span class="welcome-user">مرحبًا، ${esc(currentUserName())}</span>
      </div>
      <div class="header-actions">
        ${currentUser?.role === 'admin' ? '<button class="icon-btn" data-action="manage-users" aria-label="إدارة المستخدمين" title="إدارة المستخدمين"><i data-lucide="users"></i></button>' : ''}
        <button class="btn-ghost notes-nav-link" data-action="open-notes" aria-label="الملاحظات"><i data-lucide="notebook-pen"></i><span>الملاحظات</span></button>
        <button class="icon-btn" data-action="toggle-search" aria-label="بحث"><i data-lucide="search"></i></button>
        <button class="btn-accent" data-action="new-list"><i data-lucide="plus"></i><span class="btn-text">قائمة جديدة</span></button>
        <button class="icon-btn subtle" data-action="logout" aria-label="تسجيل الخروج" title="تسجيل الخروج"><i data-lucide="log-out"></i></button>
      </div>
    </div>`;

  const searchHtml = searchOpen ? `
    <div class="search-bar">
      <i data-lucide="search"></i>
      <input id="search-input" type="search" placeholder="ابحث عن قائمة أو مهمة..." value="${esc(searchQuery)}" autocomplete="off">
      ${searchQuery ? '<button class="icon-btn subtle" data-action="clear-search" aria-label="مسح"><i data-lucide="x"></i></button>' : ''}
    </div>
    <div id="search-results"></div>` : '';

  const pinned = lists.filter((l) => l.pinned);
  const others = lists.filter((l) => !l.pinned);

  const contentHtml = lists.length ? `
    ${pinned.length ? `
      <h3 class="section-title pin-title"><i data-lucide="pin"></i> مثبتة</h3>
      <div class="lists-grid" id="pinned-grid">${pinned.map(listCard).join('')}</div>` : ''}
    ${pinned.length && others.length ? '<h3 class="section-title">القوائم</h3>' : ''}
    <div class="lists-grid" id="lists-grid">
      ${others.map(listCard).join('')}
      <button class="add-card" data-action="new-list"><i data-lucide="plus"></i><span>إضافة قائمة</span></button>
    </div>` : `
    <div class="empty">
      <div class="empty-icon"><i data-lucide="list-plus"></i></div>
      <h2>لا توجد قوائم حتى الآن</h2>
      <p>أنشئ أول قائمة وابدأ بتنظيم مهامك.</p>
      <button class="btn-accent lg" data-action="new-list"><i data-lucide="plus"></i> إنشاء قائمة</button>
    </div>`;

  mainEl.innerHTML = searchHtml + `<div id="home-content" ${searchQuery.trim() ? 'hidden' : ''}>${contentHtml}${homeNotesSection()}${goalsSection()}</div>`;

  if (searchOpen) updateSearchResults();
  const grid = document.getElementById('lists-grid');
  if (grid) makeSortable(grid, '.list-card', '.card-drag', (ids) => store.reorderLists(ids), 'grid');
  const pinnedGrid = document.getElementById('pinned-grid');
  if (pinnedGrid) makeSortable(pinnedGrid, '.list-card', '.card-drag', (ids) => store.reorderLists(ids), 'grid');
}

function searchTaskRow(t) {
  const l = store.getList(t.listId);
  const s = STATUSES[t.status];
  return `
    <div class="task clickable ${t.status === 'completed' ? 'done' : ''}" data-action="goto-list" data-id="${t.listId}">
      <span class="check-btn static">${t.status === 'completed' ? '<i data-lucide="check"></i>' : ''}</span>
      <span class="task-title">${esc(t.title)}</span>
      ${l ? `<span class="list-chip"><i data-lucide="${l.icon}" style="color:${l.color}"></i>${esc(l.title)}</span>` : ''}
      <span class="status-badge static" style="--sc:${s.color}"><span class="dot"></span><span class="badge-label">${s.label}</span></span>
    </div>`;
}

function updateSearchResults() {
  const box = document.getElementById('search-results');
  if (!box) return;
  const q = searchQuery.trim();
  if (!q) { box.innerHTML = ''; return; }
  const lists = store.lists.filter((l) => l.title.includes(q));
  const tasks = store.allTasks().filter((t) => t.title.includes(q));
  box.innerHTML = `
    ${lists.length ? `<h3 class="section-title">قوائم</h3><div class="lists-grid">${lists.map(listCard).join('')}</div>` : ''}
    ${tasks.length ? `<h3 class="section-title">مهام</h3><div class="tasks">${tasks.map(searchTaskRow).join('')}</div>` : ''}
    ${!lists.length && !tasks.length ? `<p class="muted center pad">لا توجد نتائج لـ «${esc(q)}»</p>` : ''}`;
  refreshIcons();
}

/* ---------------- List view (tasks) ---------------- */

function taskRow(t) {
  const s = STATUSES[t.status];
  return `
    <div class="task ${t.status === 'completed' ? 'done' : ''}" data-id="${t.id}">
      <span class="drag-handle" aria-label="إعادة ترتيب"><i data-lucide="grip-vertical"></i></span>
      <button class="check-btn" data-toggle-check="${t.id}" aria-label="تبديل الإنجاز">${t.status === 'completed' ? '<i data-lucide="check"></i>' : ''}</button>
      <span class="task-title" data-edit="${t.id}">${esc(t.title)}</span>
      <button class="status-badge" data-status="${t.id}" style="--sc:${s.color}"><span class="dot"></span><span class="badge-label">${s.label}</span></button>
      <button class="icon-btn subtle sm task-note-btn ${t.note ? 'has-note' : ''}" data-task-note="${t.id}" aria-label="${t.note ? 'عرض ملاحظة المهمة' : 'إضافة ملاحظة للمهمة'}" title="${t.note ? esc(t.note) : 'إضافة ملاحظة'}"><i data-lucide="sticky-note"></i></button>
      <button class="icon-btn subtle sm" data-task-menu="${t.id}" aria-label="خيارات المهمة"><i data-lucide="more-horizontal"></i></button>
    </div>`;
}

function renderListView(id) {
  const l = store.getList(id);
  const all = store.tasksOf(id);
  const doneCount = all.filter((t) => t.status === 'completed').length;

  // جاري العمل دائمًا في الأعلى، ثم الباقي حسب الترتيب اليدوي
  const inProgressFirst = (a, b) =>
    (b.status === 'in_progress') - (a.status === 'in_progress') || a.order - b.order;

  let tasksHtml = '';
  if (filter === 'all') {
    const active = all.filter((t) => t.status !== 'completed').sort(inProgressFirst);
    const done = all.filter((t) => t.status === 'completed');
    tasksHtml = `
      <div class="tasks" id="tasks">${active.map(taskRow).join('')}</div>
      ${done.length ? `
        <button class="completed-toggle" data-action="toggle-completed">
          <i data-lucide="chevron-${completedOpen ? 'down' : 'left'}"></i>
          المهام المكتملة
          <span class="completed-count">${done.length}</span>
        </button>
        <div class="tasks completed-list" ${completedOpen ? '' : 'hidden'}>${done.map(taskRow).join('')}</div>` : ''}`;
  } else {
    const tasks = all.filter((t) => t.status === filter);
    tasksHtml = `<div class="tasks" id="tasks">${tasks.map(taskRow).join('') || '<p class="muted center pad">لا توجد مهام بهذه الحالة.</p>'}</div>`;
  }

  headerEl.innerHTML = `
    <div class="header-inner">
      <div class="header-start">
        <button class="icon-btn" data-action="back" aria-label="رجوع"><i data-lucide="arrow-right"></i></button>
        <span class="list-icon sm" style="--c:${l.color}"><i data-lucide="${l.icon}"></i></span>
        <div class="header-titles">
          <h1 class="app-title">${esc(l.title)}</h1>
          <span class="muted sm-text">${all.length} مهمة · ${doneCount} مكتملة${currentUser?.role === 'admin' ? ` · ${esc(l.userEmail)}` : ''}</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" data-action="focus-add" aria-label="إضافة مهمة"><i data-lucide="plus"></i></button>
        <button class="icon-btn subtle" data-action="list-menu" data-id="${l.id}" aria-label="خيارات القائمة"><i data-lucide="more-horizontal"></i></button>
      </div>
    </div>`;

  const chips = [['all', 'الكل'], ...STATUS_ORDER.map((s) => [s, STATUSES[s].label])]
    .map(([v, label]) => `<button class="chip ${filter === v ? 'active' : ''}" data-filter="${v}">${label}</button>`)
    .join('');

  mainEl.innerHTML = `
    <div class="chips">${chips}</div>
    ${l.recurring ? `
      <button class="start-btn" data-action="start-over" data-id="${l.id}">
        <i data-lucide="play"></i> البداية
        <span class="start-sub">إعادة جميع المهام إلى «لم أبدأ»</span>
      </button>` : ''}
    ${all.length
      ? tasksHtml
      : `<div class="empty">
          <div class="empty-icon"><i data-lucide="clipboard-list"></i></div>
          <h2>لا توجد مهام</h2>
          <p>أضف أول مهمة لهذه القائمة من الأسفل.</p>
        </div>`}
    <div class="add-task-row">
      <i data-lucide="plus"></i>
      <input id="add-task-input" placeholder="مهمة جديدة" autocomplete="off" enterkeyhint="done">
    </div>`;

  const tasksEl = document.getElementById('tasks');
  if (tasksEl && filter === 'all') {
    makeSortable(tasksEl, '.task', '.drag-handle', (ids) => store.reorderTasks(id, ids), 'y');
  }
}

/* ---------------- Overlays ---------------- */

function closeOverlay() {
  overlayRoot.innerHTML = '';
  document.body.style.overflow = '';
}

function openPopover(anchor, contentEl) {
  closeOverlay();
  const bd = document.createElement('div');
  bd.className = 'backdrop transparent';
  bd.addEventListener('click', closeOverlay);
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.appendChild(contentEl);
  overlayRoot.append(bd, pop);
  refreshIcons();

  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
  let right = window.innerWidth - r.right;
  if (right + pw > window.innerWidth - 8) right = window.innerWidth - pw - 8;
  pop.style.top = `${Math.max(8, top)}px`;
  pop.style.right = `${Math.max(8, right)}px`;
}

function openSheet(title, contentEl) {
  closeOverlay();
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.addEventListener('click', closeOverlay);
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sheet-handle"></div><h3 class="sheet-title">${esc(title)}</h3>`;
  sheet.appendChild(contentEl);
  overlayRoot.append(bd, sheet);
  document.body.style.overflow = 'hidden';
  refreshIcons();
}

function menuContent(items) {
  const wrap = document.createElement('div');
  wrap.className = 'menu';
  items.forEach((it) => {
    const b = document.createElement('button');
    b.className = `menu-item${it.danger ? ' danger' : ''}`;
    b.innerHTML = `<i data-lucide="${it.icon}"></i>${it.label}`;
    b.addEventListener('click', () => { closeOverlay(); it.onClick(); });
    wrap.appendChild(b);
  });
  return wrap;
}

function statusPickerContent(taskId) {
  const wrap = document.createElement('div');
  wrap.className = 'status-list';
  const task = store.getTask(taskId);
  STATUS_ORDER.forEach((s) => {
    const b = document.createElement('button');
    b.className = `status-option${task && task.status === s ? ' current' : ''}`;
    b.innerHTML = `<span class="dot" style="--sc:${STATUSES[s].color}"></span>${STATUSES[s].label}`;
    b.addEventListener('click', () => { store.updateTask(taskId, { status: s }); closeOverlay(); });
    wrap.appendChild(b);
  });
  return wrap;
}

function openStatusPicker(anchor, taskId) {
  if (isMobile()) openSheet('حالة المهمة', statusPickerContent(taskId));
  else openPopover(anchor, statusPickerContent(taskId));
}

function openTaskMenu(anchor, id) {
  openPopover(anchor, menuContent([
    {
      icon: 'pencil', label: 'تعديل',
      onClick: () => {
        const el = document.querySelector(`[data-edit="${id}"]`);
        if (el) startEditTask(el, id);
      },
    },
    { icon: 'refresh-cw', label: 'تغيير الحالة', onClick: () => openStatusPicker(anchor, id) },
    { icon: 'trash-2', label: 'حذف', danger: true, onClick: () => store.deleteTask(id) },
  ]));
}

function openTaskNoteModal(task) {
  if (!task) return;
  closeOverlay();
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.addEventListener('click', closeOverlay);
  const modal = document.createElement('div');
  modal.className = 'modal task-note-modal';
  modal.innerHTML = `
    <div class="task-note-modal-head">
      <span><i data-lucide="sticky-note"></i></span>
      <div><h2>ملاحظة المهمة</h2><p class="muted">${esc(task.title)}</p></div>
    </div>
    <label class="field-label" for="task-note-input">اكتب ما تريد تذكّره</label>
    <textarea id="task-note-input" class="task-note-input" maxlength="4000" placeholder="مثال: تواصل مع العميل قبل البدء…">${esc(task.note || '')}</textarea>
    <div class="modal-actions">
      <button class="btn-ghost" data-x="cancel">إلغاء</button>
      ${task.note ? '<button class="btn-danger" data-x="remove">حذف الملاحظة</button>' : ''}
      <button class="btn-accent" data-x="save">حفظ</button>
    </div>`;
  overlayRoot.append(bd, modal);
  document.body.style.overflow = 'hidden';
  refreshIcons();
  const input = modal.querySelector('#task-note-input');
  const save = () => {
    store.updateTask(task.id, { note: input.value.trim() });
    closeOverlay();
  };
  modal.querySelector('[data-x="cancel"]').addEventListener('click', closeOverlay);
  modal.querySelector('[data-x="save"]').addEventListener('click', save);
  modal.querySelector('[data-x="remove"]')?.addEventListener('click', () => {
    store.updateTask(task.id, { note: '' });
    closeOverlay();
  });
  input.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') save();
  });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function openListMenu(anchor, id) {
  const list = store.getList(id);
  if (!list) return;
  const count = store.tasksOf(id).length;
  openPopover(anchor, menuContent([
    {
      icon: list.pinned ? 'pin-off' : 'pin',
      label: list.pinned ? 'إلغاء التثبيت' : 'تثبيت',
      onClick: () => store.updateList(id, { pinned: !list.pinned }),
    },
    { icon: 'pencil', label: 'تعديل', onClick: () => openListModal(list) },
    {
      icon: 'trash-2', label: 'حذف القائمة', danger: true,
      onClick: () => {
        const doDelete = () => {
          const r = currentRoute();
          if (r.view === 'list' && r.id === id) location.hash = '';
          store.deleteList(id);
        };
        if (count > 0) {
          openConfirm({
            title: 'حذف القائمة',
            message: `هل أنت متأكد من حذف هذه القائمة؟ سيتم حذف جميع المهام الموجودة داخلها (${count} مهمة).`,
            onConfirm: doDelete,
          });
        } else {
          doDelete();
        }
      },
    },
  ]));
}

function openGoalMenu(anchor, id) {
  const goal = store.getGoal(id);
  if (!goal) return;
  const content = menuContent([
    { icon: 'pencil', label: 'تعديل الهدف', onClick: () => openGoalModal(goal) },
    {
      icon: 'trash-2', label: 'حذف الهدف', danger: true,
      onClick: () => openConfirm({
        title: 'حذف الهدف',
        message: `هل أنت متأكد من حذف هدف «${goal.title}»؟`,
        onConfirm: () => store.deleteGoal(id),
      }),
    },
  ]);
  if (isMobile()) openSheet('خيارات الهدف', content);
  else openPopover(anchor, content);
}

function openConfirm({ title, message, confirmLabel = 'حذف', onConfirm }) {
  closeOverlay();
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.addEventListener('click', closeOverlay);
  const m = document.createElement('div');
  m.className = 'modal sm-modal';
  m.innerHTML = `
    <h2>${esc(title)}</h2>
    <p class="muted">${esc(message)}</p>
    <div class="modal-actions">
      <button class="btn-ghost" data-x="cancel">إلغاء</button>
      <button class="btn-danger" data-x="ok">${esc(confirmLabel)}</button>
    </div>`;
  m.querySelector('[data-x="cancel"]').addEventListener('click', closeOverlay);
  m.querySelector('[data-x="ok"]').addEventListener('click', () => { closeOverlay(); onConfirm(); });
  overlayRoot.append(bd, m);
  document.body.style.overflow = 'hidden';
}

function openGoalModal(goal = null) {
  closeOverlay();
  const isEdit = !!goal;
  const initialProgress = Math.max(0, Math.min(100, Number(goal?.progress) || 0));
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.addEventListener('click', closeOverlay);
  const m = document.createElement('div');
  m.className = 'modal goal-modal';
  m.innerHTML = `
    <div class="goal-modal-head">
      <span class="goal-modal-icon"><i data-lucide="target"></i></span>
      <div><h2>${isEdit ? 'تعديل الهدف' : 'إضافة هدف جديد'}</h2><p class="muted">حوّل فكرتك إلى تقدّم واضح يمكنك قياسه.</p></div>
    </div>
    <label class="field-label" for="goal-title">اسم الهدف</label>
    <input id="goal-title" class="text-input" maxlength="200" autocomplete="off" placeholder="مثال: إطلاق المتجر الجديد" value="${esc(goal?.title || '')}">
    <div class="goal-progress-label"><label for="goal-progress-range">نسبة الإنجاز الحالية</label><output id="goal-progress-output">${initialProgress}%</output></div>
    <div class="goal-progress-editor">
      <input id="goal-progress-range" class="goal-range" type="range" min="0" max="100" step="1" value="${initialProgress}" style="--range-progress:${initialProgress}%">
      <div class="goal-number-wrap"><input id="goal-progress-number" type="number" min="0" max="100" step="1" value="${initialProgress}" aria-label="نسبة الإنجاز"><span>%</span></div>
    </div>
    <p class="login-error" id="goal-form-error" hidden></p>
    <div class="modal-actions"><button class="btn-ghost" data-x="cancel">إلغاء</button><button class="btn-accent" data-x="save">حفظ الهدف</button></div>`;
  overlayRoot.append(bd, m);
  document.body.style.overflow = 'hidden';
  refreshIcons();

  const titleInput = m.querySelector('#goal-title');
  const rangeInput = m.querySelector('#goal-progress-range');
  const numberInput = m.querySelector('#goal-progress-number');
  const output = m.querySelector('#goal-progress-output');
  const error = m.querySelector('#goal-form-error');
  const setProgress = (raw) => {
    const value = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    rangeInput.value = value;
    numberInput.value = value;
    output.value = `${value}%`;
    rangeInput.style.setProperty('--range-progress', `${value}%`);
  };
  rangeInput.addEventListener('input', () => setProgress(rangeInput.value));
  numberInput.addEventListener('input', () => setProgress(numberInput.value));
  const save = () => {
    const title = titleInput.value.trim();
    const progress = Number(rangeInput.value);
    if (!title) {
      error.textContent = 'أدخل اسم الهدف أولًا.';
      error.hidden = false;
      titleInput.classList.add('error');
      titleInput.focus();
      return;
    }
    if (isEdit) store.updateGoal(goal.id, { title, progress });
    else store.addGoal(title, progress);
    closeOverlay();
  };
  m.querySelector('[data-x="cancel"]').addEventListener('click', closeOverlay);
  m.querySelector('[data-x="save"]').addEventListener('click', save);
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  titleInput.focus();
}

function openListModal(list) {
  const isEdit = !!list;
  let color = list?.color ?? LIST_COLORS[0].value;
  let icon = list?.icon ?? 'list';
  let recurring = list?.recurring ?? false;
  closeOverlay();

  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.addEventListener('click', closeOverlay);

  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `
    <h2>${isEdit ? 'تعديل القائمة' : 'قائمة جديدة'}</h2>
    <label class="field-label" for="list-name">اسم القائمة</label>
    <input id="list-name" class="text-input" value="${esc(list?.title ?? '')}" placeholder="مثال: مهام اليوم" maxlength="60" autocomplete="off">
    <label class="field-label">اللون</label>
    <div class="color-row">
      ${LIST_COLORS.map((c) => `<button class="color-dot ${c.value === color ? 'sel' : ''}" data-color="${c.value}" style="--c:${c.value}" title="${c.name}" aria-label="${c.name}"></button>`).join('')}
    </div>
    <label class="field-label">الأيقونة</label>
    <div class="icon-grid">
      ${LIST_ICONS.map((ic) => `<button class="icon-choice ${ic === icon ? 'sel' : ''}" data-icon="${ic}"><i data-lucide="${ic}"></i></button>`).join('')}
    </div>
    <button class="toggle-row" id="recurring-toggle" role="switch" aria-checked="${recurring}">
      <span class="toggle-text">
        <span class="toggle-title"><i data-lucide="repeat"></i> تفعيل التكرار بالقائمة</span>
        <span class="toggle-sub">تتكرر مهام هذه القائمة يوميًا، وتعود للبدء من جديد بزر «البداية»</span>
      </span>
      <span class="switch ${recurring ? 'on' : ''}"><span class="switch-knob"></span></span>
    </button>
    <div class="modal-actions">
      <button class="btn-ghost" data-x="cancel">إلغاء</button>
      <button class="btn-accent" data-x="save">${isEdit ? 'حفظ' : 'إنشاء'}</button>
    </div>`;

  overlayRoot.append(bd, m);
  document.body.style.overflow = 'hidden';
  refreshIcons();

  const nameInput = m.querySelector('#list-name');
  nameInput.focus();

  m.querySelector('.color-row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    color = b.dataset.color;
    m.querySelectorAll('.color-dot').forEach((d) => d.classList.toggle('sel', d === b));
  });

  m.querySelector('.icon-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    icon = b.dataset.icon;
    m.querySelectorAll('.icon-choice').forEach((d) => d.classList.toggle('sel', d === b));
  });

  const toggleBtn = m.querySelector('#recurring-toggle');
  toggleBtn.addEventListener('click', () => {
    recurring = !recurring;
    toggleBtn.setAttribute('aria-checked', String(recurring));
    toggleBtn.querySelector('.switch').classList.toggle('on', recurring);
  });

  const save = () => {
    const title = nameInput.value.trim();
    if (!title) {
      nameInput.classList.add('error');
      nameInput.focus();
      return;
    }
    if (isEdit) store.updateList(list.id, { title, color, icon, recurring });
    else store.addList({ title, color, icon, recurring });
    closeOverlay();
  };

  m.querySelector('[data-x="cancel"]').addEventListener('click', closeOverlay);
  m.querySelector('[data-x="save"]').addEventListener('click', save);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
}

/* ---------------- Inline task editing ---------------- */

function startEditTask(el, id) {
  if (el.querySelector('input')) return;
  const task = store.getTask(id);
  if (!task) return;
  const input = document.createElement('input');
  input.className = 'text-input inline-edit';
  input.value = task.title;
  input.maxLength = 200;
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const commit = () => {
    const v = input.value.trim();
    if (v && v !== task.title) store.updateTask(id, { title: v });
    else render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = task.title; input.blur(); }
  });
  input.addEventListener('blur', commit);
}

/* ---------------- Admin users ---------------- */

async function usersApi(path = '', method = 'GET', body) {
  const res = await fetch(`/api/users${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'request_failed');
    error.status = res.status;
    throw error;
  }
  return data;
}

async function loadUsers() {
  const data = await usersApi();
  adminUsers = data.users;
}

function renderUsers() {
  headerEl.innerHTML = `
    <div class="header-inner">
      <div class="header-start">
        <button class="icon-btn" data-action="back" aria-label="رجوع"><i data-lucide="arrow-right"></i></button>
        <div class="header-titles"><h1 class="app-title">إدارة المستخدمين</h1><span class="muted sm-text">${adminUsers.length} حساب</span></div>
      </div>
      <button class="btn-accent" data-action="new-user"><i data-lucide="user-plus"></i><span class="btn-text">مستخدم جديد</span></button>
    </div>`;
  mainEl.innerHTML = `
    <div class="users-grid">
      ${adminUsers.map((u) => `
        <article class="user-card ${u.active ? '' : 'disabled'}">
          <div class="user-card-head">
            <span class="user-avatar"><i data-lucide="${u.role === 'admin' ? 'shield-check' : 'user'}"></i></span>
            <div class="user-identity"><strong dir="ltr">${esc(u.email)}</strong><span>${u.role === 'admin' ? 'الأدمن الرئيسي' : (u.active ? 'حساب نشط' : 'حساب معطّل')}</span></div>
          </div>
          <div class="user-stats"><span>${u.listsCount} قائمة</span><span>${u.tasksCount} مهمة</span><span>${u.goalsCount || 0} هدف</span><span>${u.notesCount || 0} ملاحظة</span></div>
          <div class="user-actions">
            <button class="btn-ghost" data-view-user-notes="${u.id}">الملاحظات</button>
          ${u.role !== 'admin' ? `
            <button class="btn-ghost" data-edit-user="${u.id}">تعديل</button>
            <button class="btn-ghost" data-toggle-user="${u.id}">${u.active ? 'تعطيل' : 'تفعيل'}</button>
            <button class="btn-danger" data-delete-user="${u.id}">حذف</button>
          ` : ''}</div>
        </article>`).join('')}
    </div>`;
}

function userErrorMessage(code) {
  return ({
    invalid_email: 'أدخل بريدًا إلكترونيًا صحيحًا.',
    weak_password: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',
    email_exists: 'هذا البريد مستخدم بالفعل.',
  })[code] || 'تعذر حفظ المستخدم. حاول مجددًا.';
}

function openUserModal(user = null) {
  closeOverlay();
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `
    <h2>${user ? 'تعديل المستخدم' : 'إضافة مستخدم'}</h2>
    <p class="muted">${user ? 'اترك كلمة المرور فارغة للإبقاء عليها كما هي.' : 'سيستخدم المستخدم هذه البيانات لتسجيل الدخول.'}</p>
    <label class="field-label" for="user-email">البريد الإلكتروني</label>
    <input id="user-email" class="text-input" type="email" dir="ltr" autocomplete="off" value="${esc(user?.email || '')}">
    <label class="field-label" for="user-password">${user ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}</label>
    <input id="user-password" class="text-input" type="password" dir="ltr" autocomplete="new-password" minlength="8">
    <p class="login-error" id="user-form-error" hidden></p>
    <div class="modal-actions"><button class="btn-ghost" data-x="cancel">إلغاء</button><button class="btn-accent" data-x="save">حفظ</button></div>`;
  overlayRoot.append(bd, m);
  const emailInput = m.querySelector('#user-email');
  const passwordInput = m.querySelector('#user-password');
  const errorEl = m.querySelector('#user-form-error');
  const saveBtn = m.querySelector('[data-x="save"]');
  const save = async () => {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    errorEl.hidden = true;
    try {
      const body = { email: emailInput.value.trim() };
      if (passwordInput.value || !user) body.password = passwordInput.value;
      const data = await usersApi(user ? `?id=${encodeURIComponent(user.id)}` : '', user ? 'PATCH' : 'POST', body);
      if (user) {
        adminUsers = adminUsers.map((item) => item.id === user.id
          ? { ...item, ...data.user, listsCount: item.listsCount, tasksCount: item.tasksCount, goalsCount: item.goalsCount, notesCount: item.notesCount }
          : item);
      } else {
        adminUsers.push(data.user);
      }
      closeOverlay();
      render();
    } catch (e) {
      errorEl.textContent = userErrorMessage(e.message);
      errorEl.hidden = false;
      saveBtn.disabled = false;
    }
  };
  bd.addEventListener('click', closeOverlay);
  m.querySelector('[data-x="cancel"]').addEventListener('click', closeOverlay);
  saveBtn.addEventListener('click', save);
  m.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  emailInput.focus();
}

async function toggleUser(id) {
  const user = adminUsers.find((u) => u.id === id);
  if (!user) return;
  const data = await usersApi(`?id=${encodeURIComponent(id)}`, 'PATCH', { active: !user.active });
  adminUsers = adminUsers.map((item) => item.id === id
    ? { ...item, ...data.user, listsCount: item.listsCount, tasksCount: item.tasksCount, goalsCount: item.goalsCount, notesCount: item.notesCount }
    : item);
  render();
}

function deleteUser(id) {
  const user = adminUsers.find((u) => u.id === id);
  if (!user) return;
  openConfirm({
    title: 'حذف المستخدم؟',
    message: `سيتم حذف حساب ${user.email} وجميع قوائمه ومهامه نهائيًا.`,
    onConfirm: async () => {
      await usersApi(`?id=${encodeURIComponent(id)}`, 'DELETE');
      adminUsers = adminUsers.filter((item) => item.id !== id);
      render();
    },
  });
}

/* ---------------- Auth gate ---------------- */

function renderLogin() {
  headerEl.innerHTML = '';
  mainEl.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="empty-icon"><i data-lucide="lock"></i></div>
        <h1 class="login-title">مهامي</h1>
        <p class="muted">سجّل الدخول للوصول إلى قوائمك ومهامك</p>
        <label class="login-label" for="login-email">البريد الإلكتروني</label>
        <input id="login-email" class="text-input login-input" type="email" dir="ltr" autocomplete="username" placeholder="name@example.com">
        <label class="login-label" for="login-password">كلمة المرور</label>
        <div class="password-field">
          <input id="login-password" class="text-input login-input" type="password" dir="ltr" autocomplete="current-password" placeholder="••••••••">
          <button class="password-toggle" type="button" id="password-toggle" aria-label="إظهار كلمة المرور"><i data-lucide="eye"></i></button>
        </div>
        <button class="btn-accent lg login-btn" id="login-btn">تسجيل الدخول</button>
        <p class="login-error" id="login-error" hidden></p>
      </div>
    </div>`;
  refreshIcons();

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  emailInput.focus();

  const submit = async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password || btn.disabled) {
      err.textContent = 'أدخل البريد الإلكتروني وكلمة المرور.';
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    err.hidden = true;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        await startApp(data.user);
        return;
      }
      const data = await res.json().catch(() => ({}));
      err.textContent = data.error === 'invalid_credentials'
        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
        : data.error === 'admin_not_initialized'
          ? 'حساب الأدمن غير مهيأ بعد. أضف ADMIN_PASSWORD في إعدادات الخادم.'
          : 'تعذر تسجيل الدخول. حاول مجددًا.';
    } catch (e) {
      err.textContent = 'تعذر الاتصال بالخادم، تحقق من الإنترنت';
    }
    err.hidden = false;
    passwordInput.value = '';
    passwordInput.focus();
    const card = document.querySelector('.login-card');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    btn.disabled = false;
  };

  btn.addEventListener('click', submit);
  document.getElementById('password-toggle').addEventListener('click', (e) => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    e.currentTarget.innerHTML = `<i data-lucide="${passwordInput.type === 'password' ? 'eye' : 'eye-off'}"></i>`;
    refreshIcons();
  });
  passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

let subscribed = false;
async function startApp(user) {
  currentUser = user;
  recentNotes = [];
  recentNotesReady = false;
  store.setCurrentUser(user);
  if (!subscribed) {
    store.subscribe(render);
    subscribed = true;
  }
  try {
    await store.init();
    await loadRecentNotes();
    render();
  } catch (e) {
    currentUser = null;
    renderLogin();
  }
}

async function boot() {
  try {
    const res = await fetch('/api/auth');
    if (!res.ok) throw new Error('unauthorized');
    const data = await res.json();
    await startApp(data.user);
  } catch (e) {
    renderLogin();
  }
}

/* ---------------- Global event delegation ---------------- */

async function handleAction(action, el) {
  switch (action) {
    case 'toggle-search':
      searchOpen = !searchOpen;
      if (!searchOpen) searchQuery = '';
      render();
      if (searchOpen) document.getElementById('search-input')?.focus();
      break;
    case 'clear-search':
      searchQuery = '';
      render();
      document.getElementById('search-input')?.focus();
      break;
    case 'new-list':
      openListModal();
      break;
    case 'new-goal':
      openGoalModal();
      break;
    case 'manage-users':
      await loadUsers();
      location.hash = '#/users';
      render();
      break;
    case 'open-notes':
      location.hash = '#/notes';
      break;
    case 'open-note':
      location.hash = `#/notes/note/${encodeURIComponent(el.dataset.id)}`;
      break;
    case 'new-home-note': {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', content: '' }),
      });
      if (!response.ok) break;
      const data = await response.json();
      recentNotes = [data.note, ...recentNotes].slice(0, 3);
      location.hash = `#/notes/note/${encodeURIComponent(data.note.id)}`;
      break;
    }
    case 'new-user':
      openUserModal();
      break;
    case 'back':
      location.hash = '';
      break;
    case 'list-menu':
      openListMenu(el, el.dataset.id);
      break;
    case 'focus-add':
      document.getElementById('add-task-input')?.focus();
      break;
    case 'goto-list':
      location.hash = `#/list/${el.dataset.id}`;
      break;
    case 'start-over':
      store.resetListTasks(el.dataset.id);
      break;
    case 'logout':
      await fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
      currentUser = null;
      recentNotes = [];
      recentNotesReady = false;
      location.hash = '';
      renderLogin();
      break;
    case 'toggle-completed':
      completedOpen = !completedOpen;
      render();
      break;
  }
}

document.addEventListener('click', (e) => {
  const t = e.target;

  const actionEl = t.closest('[data-action]');
  if (actionEl) { handleAction(actionEl.dataset.action, actionEl); return; }

  const editUser = t.closest('[data-edit-user]');
  if (editUser) { openUserModal(adminUsers.find((u) => u.id === editUser.dataset.editUser)); return; }

  const toggleUserEl = t.closest('[data-toggle-user]');
  if (toggleUserEl) { toggleUser(toggleUserEl.dataset.toggleUser).catch(console.error); return; }

  const deleteUserEl = t.closest('[data-delete-user]');
  if (deleteUserEl) { deleteUser(deleteUserEl.dataset.deleteUser); return; }

  const viewUserNotes = t.closest('[data-view-user-notes]');
  if (viewUserNotes) { location.hash = `#/notes/user/${viewUserNotes.dataset.viewUserNotes}`; return; }

  const cardMenu = t.closest('[data-card-menu]');
  if (cardMenu) { openListMenu(cardMenu, cardMenu.dataset.cardMenu); return; }

  const goalMenu = t.closest('[data-goal-menu]');
  if (goalMenu) { openGoalMenu(goalMenu, goalMenu.dataset.goalMenu); return; }

  const taskMenu = t.closest('[data-task-menu]');
  if (taskMenu) { openTaskMenu(taskMenu, taskMenu.dataset.taskMenu); return; }

  const taskNote = t.closest('[data-task-note]');
  if (taskNote) { openTaskNoteModal(store.getTask(taskNote.dataset.taskNote)); return; }

  const checkBtn = t.closest('[data-toggle-check]');
  if (checkBtn) {
    const task = store.getTask(checkBtn.dataset.toggleCheck);
    if (task) store.updateTask(task.id, { status: task.status === 'completed' ? 'not_started' : 'completed' });
    return;
  }

  const statusBtn = t.closest('[data-status]');
  if (statusBtn) { openStatusPicker(statusBtn, statusBtn.dataset.status); return; }

  const filterEl = t.closest('[data-filter]');
  if (filterEl) { filter = filterEl.dataset.filter; render(); return; }

  const editEl = t.closest('[data-edit]');
  if (editEl) { startEditTask(editEl, editEl.dataset.edit); return; }

  const card = t.closest('.list-card');
  if (card && !t.closest('.card-drag')) {
    location.hash = `#/list/${card.dataset.id}`;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'search-input') {
    searchQuery = e.target.value;
    const content = document.getElementById('home-content');
    if (content) content.hidden = !!searchQuery.trim();
    updateSearchResults();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlay();
  if (e.key === 'Enter' && e.target.id === 'add-task-input') {
    const title = e.target.value.trim();
    if (!title) return;
    const r = currentRoute();
    if (r.view === 'list') store.addTask(r.id, title);
  }
});

window.addEventListener('hashchange', async () => {
  if (notesApp.isActive()) await notesApp.flush();
  const refreshHomeNotes = !location.hash.startsWith('#/notes') && currentRoute().view === 'home';
  filter = 'all';
  closeOverlay();
  render();
  if (refreshHomeNotes) {
    loadRecentNotes(true).then(() => {
      if (currentRoute().view === 'home') render();
    });
  }
});

window.addEventListener('auth-required', () => {
  currentUser = null;
  location.hash = '';
  renderLogin();
});

boot();
