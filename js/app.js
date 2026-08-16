import { store } from './store.js';
import { LIST_COLORS, LIST_ICONS, STATUSES, STATUS_ORDER } from './constants.js';
import { makeSortable } from './dnd.js';

const headerEl = document.getElementById('header');
const mainEl = document.getElementById('main');
const overlayRoot = document.getElementById('overlay-root');

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
const refreshIcons = () => window.lucide?.createIcons();

let searchOpen = false;
let searchQuery = '';
let filter = 'all';
let completedOpen = false;
let currentUser = null;
let adminUsers = [];

/* ---------------- Routing ---------------- */

function currentRoute() {
  if (location.hash === '#/users' && currentUser?.role === 'admin') return { view: 'users' };
  const m = location.hash.match(/^#\/list\/(.+)$/);
  if (m && store.getList(m[1])) return { view: 'list', id: m[1] };
  return { view: 'home' };
}

function render() {
  const activeId = document.activeElement?.id;
  const r = currentRoute();
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
      ${currentUser?.role === 'admin' ? `<p class="owner-label"><i data-lucide="user"></i>${esc(l.userEmail)}</p>` : ''}
      <p class="list-count">${l.recurring ? '<i data-lucide="repeat" class="repeat-ico"></i>' : ''}${tasks.length ? `${done} من ${tasks.length} مكتملة` : 'لا توجد مهام'}</p>
      <div class="card-bottom">
        <div class="progress"><div class="progress-fill" style="width:${pct}%;--c:${l.color}"></div></div>
        <span class="drag-handle card-drag" aria-label="إعادة ترتيب"><i data-lucide="grip-vertical"></i></span>
      </div>
    </article>`;
}

function renderHome() {
  const lists = store.lists;

  headerEl.innerHTML = `
    <div class="header-inner">
      <h1 class="app-title"><span class="logo-dot"></span>مهامي</h1>
      <div class="header-actions">
        ${currentUser?.role === 'admin' ? '<button class="icon-btn" data-action="manage-users" aria-label="إدارة المستخدمين" title="إدارة المستخدمين"><i data-lucide="users"></i></button>' : ''}
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

  mainEl.innerHTML = searchHtml + `<div id="home-content" ${searchQuery.trim() ? 'hidden' : ''}>${contentHtml}</div>`;

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
          <div class="user-stats"><span>${u.listsCount} قائمة</span><span>${u.tasksCount} مهمة</span></div>
          ${u.role !== 'admin' ? `<div class="user-actions">
            <button class="btn-ghost" data-edit-user="${u.id}">تعديل</button>
            <button class="btn-ghost" data-toggle-user="${u.id}">${u.active ? 'تعطيل' : 'تفعيل'}</button>
            <button class="btn-danger" data-delete-user="${u.id}">حذف</button>
          </div>` : ''}
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
      await usersApi(user ? `?id=${encodeURIComponent(user.id)}` : '', user ? 'PATCH' : 'POST', body);
      await loadUsers();
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
  await usersApi(`?id=${encodeURIComponent(id)}`, 'PATCH', { active: !user.active });
  await loadUsers();
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
      await loadUsers();
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
  store.setCurrentUser(user);
  if (!subscribed) {
    store.subscribe(render);
    subscribed = true;
  }
  try {
    await store.init();
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
    case 'manage-users':
      await loadUsers();
      location.hash = '#/users';
      render();
      break;
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

  const cardMenu = t.closest('[data-card-menu]');
  if (cardMenu) { openListMenu(cardMenu, cardMenu.dataset.cardMenu); return; }

  const taskMenu = t.closest('[data-task-menu]');
  if (taskMenu) { openTaskMenu(taskMenu, taskMenu.dataset.taskMenu); return; }

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

window.addEventListener('hashchange', () => {
  filter = 'all';
  closeOverlay();
  render();
});

window.addEventListener('auth-required', () => {
  currentUser = null;
  location.hash = '';
  renderLogin();
});

boot();
