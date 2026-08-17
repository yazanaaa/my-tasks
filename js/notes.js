const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const api = async (path = '', options = {}) => {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'request_failed');
    error.status = response.status;
    throw error;
  }
  return data;
};

const cleanHtml = (html = '') => {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const allowed = new Set(['DIV', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'INPUT']);
  [...doc.body.querySelectorAll('*')].forEach((node) => {
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    const checked = node.tagName === 'INPUT' && (node.checked || node.hasAttribute('checked'));
    [...node.attributes].forEach((attr) => node.removeAttribute(attr.name));
    if (node.tagName === 'INPUT') {
      node.setAttribute('type', 'checkbox');
      if (checked) node.setAttribute('checked', '');
    }
  });
  return doc.body.firstElementChild?.innerHTML || '';
};

const plainText = (html = '') => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

const readableDate = (timestamp) => {
  const date = new Date(Number(timestamp));
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((start - day) / 86400000);
  const time = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(date);
  if (diff === 0) return `اليوم، ${time}`;
  if (diff === 1) return `أمس، ${time}`;
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' }).format(date);
};

export function createNotesApp({ headerEl, mainEl, overlayRoot, getCurrentUser, getAdminUser, onExit }) {
  const state = {
    folders: [], notes: [], activeId: null, scope: 'all', search: '',
    mobilePane: 'folders', routeKey: '', readOnly: false, targetId: null,
    saveTimer: null, serverSearchTimer: null, dirty: false, loading: false,
    savePromise: Promise.resolve(),
    loadPromise: null,
    loadingKey: '',
  };

  const currentNote = () => state.notes.find((note) => note.id === state.activeId);
  const targetQuery = () => state.targetId ? `user_id=${encodeURIComponent(state.targetId)}` : '';
  const iconRefresh = () => window.lucide?.createIcons();

  function closeDialog() {
    overlayRoot.innerHTML = '';
    document.body.style.overflow = '';
  }

  function askConfirm(message) {
    return new Promise((resolve) => {
      overlayRoot.innerHTML = `<div class="backdrop" data-note-dialog="cancel"></div><div class="modal sm-modal">
        <h2>تأكيد الحذف</h2><p class="muted">${esc(message)}</p>
        <div class="modal-actions"><button class="btn-ghost" data-note-dialog="cancel">إلغاء</button><button class="btn-danger" data-note-dialog="confirm">حذف</button></div>
      </div>`;
      document.body.style.overflow = 'hidden';
      overlayRoot.querySelectorAll('[data-note-dialog="cancel"]').forEach((element) => element.addEventListener('click', () => { closeDialog(); resolve(false); }));
      overlayRoot.querySelector('[data-note-dialog="confirm"]').addEventListener('click', () => { closeDialog(); resolve(true); });
    });
  }

  function askFolderName() {
    return new Promise((resolve) => {
      overlayRoot.innerHTML = `<div class="backdrop" data-note-dialog="cancel"></div><div class="modal sm-modal">
        <h2>مجلد جديد</h2><label class="field-label" for="new-note-folder">اسم المجلد</label>
        <input id="new-note-folder" class="text-input" maxlength="100" autocomplete="off" placeholder="مثال: أفكار العمل">
        <div class="modal-actions"><button class="btn-ghost" data-note-dialog="cancel">إلغاء</button><button class="btn-accent" data-note-dialog="confirm">إنشاء</button></div>
      </div>`;
      document.body.style.overflow = 'hidden';
      const input = overlayRoot.querySelector('#new-note-folder');
      const finish = (value) => { closeDialog(); resolve(value); };
      overlayRoot.querySelectorAll('[data-note-dialog="cancel"]').forEach((element) => element.addEventListener('click', () => finish('')));
      overlayRoot.querySelector('[data-note-dialog="confirm"]').addEventListener('click', () => finish(input.value.trim()));
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') finish(input.value.trim()); });
      input.focus();
    });
  }

  function visibleNotes() {
    const query = state.search.trim().toLocaleLowerCase('ar');
    return state.notes
      .filter((note) => {
        if (state.scope === 'trash') return note.isDeleted;
        if (note.isDeleted) return false;
        if (state.scope === 'pinned' && !note.isPinned) return false;
        if (state.scope.startsWith('folder:') && note.folderId !== state.scope.slice(7)) return false;
        if (!query) return true;
        return `${note.title} ${plainText(note.content)}`.toLocaleLowerCase('ar').includes(query);
      })
      .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt);
  }

  function scopeTitle() {
    if (state.scope === 'pinned') return 'المثبتة';
    if (state.scope === 'trash') return 'المحذوفة مؤخراً';
    if (state.scope.startsWith('folder:')) return state.folders.find((folder) => folder.id === state.scope.slice(7))?.name || 'مجلد';
    return 'كل الملاحظات';
  }

  function folderRow(id, label, icon, count) {
    return `<button class="notes-folder ${state.scope === id ? 'active' : ''}" data-note-scope="${esc(id)}">
      <span><i data-lucide="${icon}"></i>${esc(label)}</span><b>${count}</b>
    </button>`;
  }

  function renderFolders() {
    const active = state.notes.filter((note) => !note.isDeleted);
    return `<aside class="notes-folders ${state.mobilePane === 'folders' ? 'mobile-active' : ''}">
      <div class="notes-pane-title"><strong>المجلدات</strong></div>
      <nav class="notes-folders-list">
        ${folderRow('all', 'كل الملاحظات', 'sticky-note', active.length)}
        ${folderRow('pinned', 'المثبتة', 'pin', active.filter((note) => note.isPinned).length)}
        <div class="notes-folder-label">مجلداتي</div>
        ${state.folders.map((folder) => folderRow(`folder:${folder.id}`, folder.name, 'folder', active.filter((note) => note.folderId === folder.id).length)).join('')}
        ${folderRow('trash', 'المحذوفة مؤخراً', 'trash-2', state.notes.filter((note) => note.isDeleted).length)}
      </nav>
      ${state.readOnly ? '' : '<button class="notes-new-folder" data-notes-action="new-folder"><i data-lucide="folder-plus"></i>مجلد جديد</button>'}
    </aside>`;
  }

  function noteCard(note) {
    return `<button class="notes-card ${note.id === state.activeId ? 'active' : ''}" data-note-id="${note.id}">
      <div class="notes-card-heading"><strong>${esc(note.title || 'ملاحظة جديدة')}</strong>${note.isPinned ? '<i data-lucide="pin"></i>' : ''}</div>
      <p>${esc(plainText(note.content) || 'لا يوجد نص')}</p>
      <time>${readableDate(note.updatedAt)}</time>
    </button>`;
  }

  function renderList() {
    const notes = visibleNotes();
    return `<section class="notes-list-pane ${state.mobilePane === 'list' ? 'mobile-active' : ''}">
      <div class="notes-pane-title notes-list-head">
        <button class="notes-mobile-back" data-notes-action="folders" aria-label="المجلدات"><i data-lucide="chevron-right"></i></button>
        <div><strong>${esc(scopeTitle())}</strong><small>${notes.length} ملاحظة</small></div>
        ${state.readOnly || state.scope === 'trash' ? '' : '<button class="icon-btn sm" data-notes-action="new-note" aria-label="ملاحظة جديدة"><i data-lucide="square-pen"></i></button>'}
      </div>
      <label class="notes-search"><i data-lucide="search"></i><input id="notes-search" type="search" placeholder="بحث في الملاحظات" value="${esc(state.search)}"></label>
      <div class="notes-cards">${notes.map(noteCard).join('') || '<div class="notes-empty"><i data-lucide="notebook-pen"></i><span>لا توجد ملاحظات هنا</span></div>'}</div>
    </section>`;
  }

  function toolbar() {
    return `<div class="notes-toolbar" role="toolbar" aria-label="تنسيق النص">
      <button data-command="bold" title="عريض"><i data-lucide="bold"></i></button>
      <button data-command="italic" title="مائل"><i data-lucide="italic"></i></button>
      <button data-command="underline" title="تحته خط"><i data-lucide="underline"></i></button>
      <span></span>
      <button data-command="insertUnorderedList" title="قائمة نقطية"><i data-lucide="list"></i></button>
      <button data-command="insertOrderedList" title="قائمة مرقمة"><i data-lucide="list-ordered"></i></button>
      <button data-command="checklist" title="قائمة مهام"><i data-lucide="list-checks"></i></button>
    </div>`;
  }

  function renderEditor() {
    const note = currentNote();
    if (!note) return `<section class="notes-editor-pane ${state.mobilePane === 'editor' ? 'mobile-active' : ''}">
      <div class="notes-editor-empty"><i data-lucide="sticky-note"></i><strong>اختر ملاحظة لعرضها</strong><span>أو أنشئ ملاحظة جديدة وابدأ الكتابة</span></div>
    </section>`;
    const deleted = note.isDeleted;
    const disabled = state.readOnly || deleted;
    return `<section class="notes-editor-pane ${state.mobilePane === 'editor' ? 'mobile-active' : ''}">
      <div class="notes-editor-actions">
        <button class="notes-mobile-back" data-notes-action="list" aria-label="قائمة الملاحظات"><i data-lucide="chevron-right"></i></button>
        <span class="notes-save-state" id="notes-save-state">${state.readOnly ? 'عرض فقط' : 'تم الحفظ'}</span>
        <div class="notes-editor-buttons">
          ${deleted ? `
            ${state.readOnly ? '' : '<button class="icon-btn sm" data-notes-action="restore" title="استعادة"><i data-lucide="rotate-ccw"></i></button>'}
            ${state.readOnly ? '' : '<button class="icon-btn sm notes-danger" data-notes-action="permanent-delete" title="حذف نهائي"><i data-lucide="trash-2"></i></button>'}` : `
            ${state.readOnly ? '' : `<button class="icon-btn sm ${note.isPinned ? 'notes-selected' : ''}" data-notes-action="pin" title="${note.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}"><i data-lucide="pin"></i></button>`}
            <button class="icon-btn sm notes-danger" data-notes-action="delete" title="نقل للمحذوفة"><i data-lucide="trash-2"></i></button>`}
        </div>
      </div>
      ${disabled ? '' : toolbar()}
      <div class="notes-editor-scroll">
        <input id="note-title" class="notes-title-input" maxlength="200" placeholder="العنوان" value="${esc(note.title)}" ${disabled ? 'disabled' : ''}>
        ${disabled ? '' : `<label class="notes-move"><span>المجلد</span><select id="note-folder"><option value="">بدون مجلد</option>${state.folders.map((folder) => `<option value="${folder.id}" ${note.folderId === folder.id ? 'selected' : ''}>${esc(folder.name)}</option>`).join('')}</select></label>`}
        <div id="note-content" class="notes-content ${disabled ? 'readonly' : ''}" ${disabled ? '' : 'contenteditable="true"'} data-placeholder="ابدأ الكتابة...">${cleanHtml(note.content)}</div>
        <time class="notes-updated">آخر تعديل: ${readableDate(note.updatedAt)}</time>
      </div>
    </section>`;
  }

  function render() {
    headerEl.innerHTML = `<div class="header-inner">
      <div class="header-start"><button class="icon-btn" id="notes-exit" aria-label="رجوع"><i data-lucide="arrow-right"></i></button><div class="header-titles"><h1 class="app-title">الملاحظات</h1><span class="muted sm-text">${state.readOnly ? `ملاحظات ${esc(getAdminUser?.(state.targetId)?.email || 'المستخدم')} · عرض فقط` : 'اكتب أفكارك واحفظها تلقائياً'}</span></div></div>
      ${state.readOnly ? '' : '<button class="btn-accent" data-notes-action="new-note"><i data-lucide="plus"></i><span class="btn-text">ملاحظة جديدة</span></button>'}
    </div>`;
    mainEl.innerHTML = `<div class="notes-shell">${renderFolders()}${renderList()}${renderEditor()}</div>`;
    bind();
    iconRefresh();
  }

  function setSaveState(text, status = '') {
    const element = document.getElementById('notes-save-state');
    if (element) {
      element.textContent = text;
      element.dataset.status = status;
    }
  }

  function editorSnapshot() {
    const note = currentNote();
    if (!note) return null;
    return {
      title: document.getElementById('note-title')?.value || '',
      content: cleanHtml(document.getElementById('note-content')?.innerHTML || ''),
      folderId: document.getElementById('note-folder')?.value || null,
    };
  }

  function markDirty() {
    if (state.readOnly || !currentNote()) return;
    state.dirty = true;
    setSaveState('جارٍ الكتابة…');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => flush(), 800);
  }

  async function flush({ keepalive = false } = {}) {
    clearTimeout(state.saveTimer);
    if (state.readOnly || !currentNote()) return;
    if (!state.dirty) {
      await state.savePromise.catch(() => {});
      return;
    }
    const note = currentNote();
    const changes = editorSnapshot();
    if (!changes) return;
    state.dirty = false;
    setSaveState('جارٍ الحفظ…', 'saving');
    state.savePromise = state.savePromise.catch(() => {}).then(async () => {
      const data = await api(`/notes/${encodeURIComponent(note.id)}`, {
        method: 'PATCH', body: JSON.stringify(changes), keepalive,
      });
      Object.assign(note, data.note);
      if (currentNote()?.id === note.id) {
        const titleInput = document.getElementById('note-title');
        if (titleInput && !titleInput.value.trim()) titleInput.value = note.title;
        setSaveState('تم الحفظ', 'saved');
      }
    });
    try {
      await state.savePromise;
    } catch (error) {
      state.dirty = true;
      setSaveState('تعذر الحفظ — سنحاول مجدداً', 'error');
    }
  }

  async function chooseNote(id) {
    await flush();
    state.activeId = id;
    state.mobilePane = 'editor';
    render();
  }

  async function chooseScope(scope) {
    await flush();
    state.scope = scope;
    state.activeId = null;
    state.mobilePane = 'list';
    render();
  }

  async function createNote() {
    if (state.readOnly) return;
    await flush();
    const folderId = state.scope.startsWith('folder:') ? state.scope.slice(7) : null;
    const data = await api('/notes', { method: 'POST', body: JSON.stringify({ folderId, title: '', content: '' }) });
    state.notes.unshift(data.note);
    state.notes[0].title = '';
    state.activeId = data.note.id;
    state.mobilePane = 'editor';
    render();
    document.getElementById('note-title')?.focus();
  }

  async function patchActive(changes, rerender = true) {
    const note = currentNote();
    if (!note) return;
    await flush();
    const data = await api(`/notes/${encodeURIComponent(note.id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
    Object.assign(note, data.note);
    if (rerender) render();
  }

  async function removeActive(permanent = false) {
    const note = currentNote();
    if (!note) return;
    const message = permanent ? 'حذف هذه الملاحظة نهائياً؟ لا يمكن التراجع.' : 'نقل هذه الملاحظة إلى المحذوفة مؤخراً؟';
    if (!await askConfirm(message)) return;
    await flush();
    const path = permanent ? `/notes/${encodeURIComponent(note.id)}/permanent` : `/notes/${encodeURIComponent(note.id)}`;
    await api(path, { method: 'DELETE' });
    if (permanent) state.notes = state.notes.filter((item) => item.id !== note.id);
    else Object.assign(note, { isDeleted: true, deletedAt: Date.now(), isPinned: false });
    state.activeId = null;
    state.mobilePane = 'list';
    render();
  }

  async function restoreActive() {
    const note = currentNote();
    if (!note) return;
    const data = await api(`/notes/${encodeURIComponent(note.id)}/restore`, { method: 'POST' });
    Object.assign(note, data.note);
    state.scope = 'all';
    render();
  }

  async function newFolder() {
    const name = await askFolderName();
    if (!name) return;
    const data = await api('/note-folders', { method: 'POST', body: JSON.stringify({ name }) });
    state.folders.push(data.folder);
    state.scope = `folder:${data.folder.id}`;
    render();
  }

  async function serverSearch() {
    if (state.notes.length < 200 || !state.search.trim()) return;
    const join = targetQuery() ? '&' : '';
    const data = await api(`/notes?${targetQuery()}${join}include_deleted=true&search=${encodeURIComponent(state.search.trim())}`);
    const byId = new Map(state.notes.map((note) => [note.id, note]));
    data.notes.forEach((note) => byId.set(note.id, note));
    state.notes = [...byId.values()];
    render();
    document.getElementById('notes-search')?.focus();
  }

  function applyCommand(command) {
    const editor = document.getElementById('note-content');
    editor?.focus();
    if (command === 'checklist') document.execCommand('insertHTML', false, '<div><input type="checkbox" disabled> </div>');
    else document.execCommand(command, false);
    markDirty();
  }

  function bind() {
    document.getElementById('notes-exit')?.addEventListener('click', async () => { await flush(); onExit(); });
    mainEl.querySelectorAll('[data-note-scope]').forEach((button) => button.addEventListener('click', () => chooseScope(button.dataset.noteScope)));
    mainEl.querySelectorAll('[data-note-id]').forEach((button) => button.addEventListener('click', () => chooseNote(button.dataset.noteId)));
    mainEl.querySelectorAll('[data-notes-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.notesAction;
      if (action === 'new-note') await createNote();
      if (action === 'new-folder') await newFolder();
      if (action === 'folders') { await flush(); state.mobilePane = 'folders'; render(); }
      if (action === 'list') { await flush(); state.mobilePane = 'list'; render(); }
      if (action === 'pin') await patchActive({ isPinned: !currentNote()?.isPinned });
      if (action === 'delete') await removeActive(false);
      if (action === 'permanent-delete') await removeActive(true);
      if (action === 'restore') await restoreActive();
    }));
    const search = document.getElementById('notes-search');
    search?.addEventListener('input', () => {
      state.search = search.value;
      const cards = mainEl.querySelector('.notes-cards');
      if (cards) cards.innerHTML = visibleNotes().map(noteCard).join('') || '<div class="notes-empty"><span>لا توجد نتائج</span></div>';
      mainEl.querySelectorAll('[data-note-id]').forEach((button) => button.addEventListener('click', () => chooseNote(button.dataset.noteId)));
      iconRefresh();
      clearTimeout(state.serverSearchTimer);
      state.serverSearchTimer = setTimeout(serverSearch, 300);
    });
    document.getElementById('note-title')?.addEventListener('input', markDirty);
    const content = document.getElementById('note-content');
    content?.addEventListener('input', markDirty);
    content?.addEventListener('change', (event) => {
      if (event.target.matches('input[type="checkbox"]')) {
        event.target.toggleAttribute('checked', event.target.checked);
        markDirty();
      }
    });
    document.getElementById('note-folder')?.addEventListener('change', markDirty);
    mainEl.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => applyCommand(button.dataset.command));
    });
  }

  async function open({ targetUserId = null, activeNoteId = null } = {}) {
    const user = getCurrentUser();
    const allowedTarget = targetUserId && user?.role === 'admin' && targetUserId !== user.id ? targetUserId : null;
    const routeKey = allowedTarget || user?.id || '';
    state.readOnly = Boolean(allowedTarget);
    state.targetId = allowedTarget;
    if (state.routeKey !== routeKey) {
      await flush();
      state.scope = 'all'; state.search = ''; state.activeId = null; state.mobilePane = 'folders';
      state.loading = true;
      headerEl.innerHTML = '';
      mainEl.innerHTML = '<div class="notes-loading"><span></span><p>جارٍ تحميل الملاحظات…</p></div>';
      if (!state.loadPromise || state.loadingKey !== routeKey) {
        const query = allowedTarget ? `user_id=${encodeURIComponent(allowedTarget)}&` : '';
        state.loadingKey = routeKey;
        state.loadPromise = api(`/notes?${query}include_deleted=true&include_folders=true`);
      }
      let data;
      try {
        data = await state.loadPromise;
      } catch (error) {
        state.loadPromise = null;
        state.loadingKey = '';
        throw error;
      }
      state.routeKey = routeKey;
      state.folders = data.folders || [];
      state.notes = data.notes || [];
      state.loading = false;
      state.loadPromise = null;
      state.loadingKey = '';
    }
    if (activeNoteId && !state.notes.some((note) => note.id === activeNoteId)) {
      const data = await api(`/notes/${encodeURIComponent(activeNoteId)}`);
      state.notes.unshift(data.note);
    }
    if (activeNoteId && state.notes.some((note) => note.id === activeNoteId)) {
      state.activeId = activeNoteId;
      state.mobilePane = 'editor';
    }
    render();
  }

  async function prefetch() {
    const user = getCurrentUser();
    const routeKey = user?.id || '';
    if (!routeKey || state.routeKey === routeKey) return;
    if (!state.loadPromise || state.loadingKey !== routeKey) {
      state.loadingKey = routeKey;
      state.loadPromise = api('/notes?include_deleted=true&include_folders=true');
    }
    let data;
    try {
      data = await state.loadPromise;
    } catch (error) {
      state.loadPromise = null;
      state.loadingKey = '';
      throw error;
    }
    if (getCurrentUser()?.id !== routeKey) return;
    state.routeKey = routeKey;
    state.targetId = null;
    state.readOnly = false;
    state.folders = data.folders || [];
    state.notes = data.notes || [];
    state.loadPromise = null;
    state.loadingKey = '';
  }

  function hydrate(data) {
    const user = getCurrentUser();
    if (!user?.id || state.dirty) return;
    state.routeKey = user.id;
    state.targetId = null;
    state.readOnly = false;
    state.folders = data.folders || [];
    state.notes = data.notes || [];
    state.loadPromise = null;
    state.loadingKey = '';
  }

  window.addEventListener('beforeunload', () => flush({ keepalive: true }));

  return { open, prefetch, hydrate, flush, isActive: () => Boolean(state.routeKey) };
}
