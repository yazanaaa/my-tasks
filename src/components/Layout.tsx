import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays, Check, Ellipsis, FolderKanban, Lightbulb, LogOut, Moon, Plus, Search, Settings, Star, Sun,
} from 'lucide-react';
import {
  closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import {
  logout, openIdeaCapture, openQuickAdd, reorderProjects, selectTask, setPaletteOpen, toggleTheme, useStore,
} from '../store';
import { joinShared } from '../lib/ideas';
import { useThemeMode } from '../lib/themeMode';
import { useCounts, useDailyLeft, useProjectList, useTaskList } from '../lib/selectors';
import type { Project } from '../types';
import { CommandPalette } from './CommandPalette';
import { FormsHost, openProjectForm } from './Forms';
import { IdeaSheetHost } from './IdeaSheet';
import { ProgressPie, VIEWS, ViewIcon, type ViewKey } from './PageTitle';
import { QuickAddModal } from './QuickAdd';
import { TaskDetailHost } from './TaskDetail';
import { ConfirmHost, Modal, Toasts, useHotkey } from './ui';

export function Wordmark() {
  return <span className="wordmark"><i><Check strokeWidth={3} /></i>مهامي</span>;
}

function ThemeButton() {
  const dark = useThemeMode() === 'dark';
  const label = dark ? 'قائمة جانبية فاتحة' : 'قائمة جانبية غامقة';
  return (
    <button className="icon-btn" aria-label={label} title={label} aria-pressed={dark} onClick={toggleTheme}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

export function initials(name: string, email: string) {
  return (name.trim() || email).slice(0, 1).toUpperCase();
}

// `key` is the Alt+number shortcut; ideas got 7 and «يومية» 8 so the older shortcuts keep their pages.
const MAIN_NAV: { view: ViewKey; key: string; count?: 'today' | 'inbox' | 'daily' }[] = [
  { view: 'today', key: '1', count: 'today' },
  { view: 'inbox', key: '3', count: 'inbox' },
  { view: 'daily', key: '8', count: 'daily' },
  { view: 'upcoming', key: '2' },
  { view: 'ideas', key: '7' },
  { view: 'calendar', key: '4' },
  { view: 'stats', key: '6' },
];

/** `?new=1|<text>` opens the idea sheet, `?add=1` task quick-add, `/ideas/share` the share target.
 *  Links only prefill: nothing is saved until the user does. */
function useCaptureLinks() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const p = new URLSearchParams(search);
    if (pathname === '/ideas/share') {
      navigate('/ideas', { replace: true });
      openIdeaCapture({ text: joinShared(p.get('title'), p.get('text'), p.get('url')), source: 'share' });
      return;
    }
    const n = p.get('new');
    const add = p.get('add');
    if (n === null && add === null) return;
    navigate(pathname, { replace: true });
    if (add !== null) openQuickAdd();
    else openIdeaCapture(n && n !== '1' ? { text: n.slice(0, 4000), source: 'link' } : {});
  }, [pathname, search, navigate]);
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  useCaptureLinks();

  useHotkey((e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k', (e) => {
    e.preventDefault();
    setPaletteOpen(!useStore.getState().paletteOpen);
  }, true);
  useHotkey((e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'q' || e.key === 'ض' || e.key === 'n'), (e) => {
    e.preventDefault();
    openQuickAdd();
  });
  useHotkey((e) => e.key === '/', (e) => {
    e.preventDefault();
    setPaletteOpen(true);
  });
  // e.code, so the Arabic layout's «ه» works too.
  useHotkey((e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyI' && !document.querySelector('.overlay'), (e) => {
    e.preventDefault();
    openIdeaCapture();
  });
  useHotkey((e) => e.altKey && /^[1-8]$/.test(e.key), (e) => {
    const item = MAIN_NAV.find((n) => n.key === e.key);
    if (!item) return;
    e.preventDefault();
    navigate(VIEWS[item.view].to);
  });

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <header className="topbar">
          <Wordmark />
          <div className="row" style={{ gap: 2 }}>
            <ThemeButton />
            <button className="icon-btn" aria-label="بحث" onClick={() => setPaletteOpen(true)}><Search /></button>
            <NavLink to="/settings" className="icon-btn" aria-label="الإعدادات"><Settings /></NavLink>
          </div>
        </header>
        {children}
      </main>
      <div className="dock">
        <TabBar onMore={() => setMoreOpen(true)} />
        <button className="fab fab-idea" aria-label="فكرة جديدة" onClick={() => openIdeaCapture()}><Lightbulb /></button>
      </div>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />

      <TaskDetailHost />
      <QuickAddModal />
      <IdeaSheetHost />
      <CommandPalette />
      <FormsHost />
      <ConfirmHost />
      <Toasts />
    </div>
  );
}

function useProjectProgress() {
  const tasks = useTaskList();
  return useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const t of tasks) {
      if (!t.projectId || t.parentId) continue;
      const p = (out[t.projectId] ??= { done: 0, total: 0 });
      p.total += 1;
      if (t.completed) p.done += 1;
    }
    return out;
  }, [tasks]);
}

function Sidebar() {
  const user = useStore((s) => s.user)!;
  const counts = useCounts();
  const dailyLeft = useDailyLeft();
  const projects = useProjectList();
  const progress = useProjectProgress();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    const next = arrayMove(projects, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    reorderProjects(next.map((p, i) => ({ id: p.id, position: (i + 1) * 1024 })));
  };

  return (
    <aside className="sidebar">
      <Wordmark />
      <div className="sidebar-actions">
        <button className="btn btn-primary" onClick={() => openQuickAdd()}><Plus />مهمة جديدة</button>
        <button className="icon-btn idea-btn" aria-label="فكرة جديدة (I)" title="فكرة جديدة (I)" onClick={() => openIdeaCapture()}><Lightbulb /></button>
        <button className="icon-btn" aria-label="بحث (Ctrl+K)" onClick={() => setPaletteOpen(true)}><Search /></button>
      </div>

      <nav className="nav">
        {MAIN_NAV.map(({ view, count }) => {
          const v = VIEWS[view];
          const n = count === 'today' ? counts.today : count === 'inbox' ? counts.inbox : count === 'daily' ? dailyLeft : 0;
          return (
            <NavLink key={view} to={v.to} end className={({ isActive }) => clsx('nav-item', isActive && 'active')} style={{ '--vc': v.color } as CSSProperties} onClick={() => selectTask(null)}>
              <ViewIcon view={view} />
              {v.label}
              {n > 0 && <span className={clsx('count num', count === 'today' && counts.overdue > 0 && 'hot')}>{n}</span>}
            </NavLink>
          );
        })}
      </nav>

      <nav className="nav">
        <div className="nav-label">
          <NavLink to="/projects" className="kicker" style={{ color: 'inherit' }}>المشاريع</NavLink>
          <button className="icon-btn sm" aria-label="مشروع جديد" onClick={() => openProjectForm()}><Plus /></button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {projects.map((p) => {
              const pr = progress[p.id];
              return <SidebarProject key={p.id} project={p} count={counts.perProject[p.id] ?? 0} value={pr ? pr.done / pr.total : 0} />;
            })}
          </SortableContext>
        </DndContext>
        {projects.length === 0 && (
          <button className="nav-item nav-project faint" onClick={() => openProjectForm()}>
            <FolderKanban />أنشئ أول مشروع
          </button>
        )}
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/settings" className="user-chip">
          <span className="avatar">{initials(user.name, user.email)}</span>
          <span className="meta">
            <b>{user.name || user.email.split('@')[0]}</b>
            <small>{user.email}</small>
          </span>
        </NavLink>
        <ThemeButton />
        <button className="icon-btn" aria-label="تسجيل الخروج" onClick={() => void logout()}><LogOut /></button>
      </div>
    </aside>
  );
}

function SidebarProject({ project, count, value }: { project: Project; count: number; value: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 2 : undefined }} {...attributes} {...listeners}>
      <NavLink
        to={`/projects/${project.id}`}
        className={({ isActive }) => clsx('nav-item nav-project', isActive && 'active')}
        onClick={() => selectTask(null)}
      >
        <ProgressPie value={value} color={project.color} size={17} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
        {count > 0 && <span className="count num">{count}</span>}
      </NavLink>
    </div>
  );
}

function TabBar({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation();
  const tabs = [
    { to: '/', label: 'اليوم', icon: Star, color: VIEWS.today.color },
    { to: '/upcoming', label: 'القادم', icon: CalendarDays, color: VIEWS.upcoming.color },
    { to: '/ideas', label: 'الأفكار', icon: Lightbulb, color: VIEWS.ideas.color, className: 'tab-ideas' },
    { to: '/projects', label: 'المشاريع', icon: FolderKanban, color: VIEWS.projects.color },
  ];
  const isMore = ['/inbox', '/daily', '/calendar', '/stats', '/settings'].some((p) => pathname.startsWith(p));
  return (
    <nav className="tabbar">
      {tabs.map(({ to, label, icon: I, color, className }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => clsx(className, isActive && 'active')} style={{ '--vc': color } as CSSProperties} aria-label={label} title={label}>
          <I />
        </NavLink>
      ))}
      <button className={clsx(isMore && 'active')} aria-label="المزيد" title="المزيد" onClick={onMore}><Ellipsis /></button>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const counts = useCounts();
  const dailyLeft = useDailyLeft();
  const items: { view: ViewKey; n?: number }[] = [
    { view: 'inbox', n: counts.inbox },
    { view: 'daily', n: dailyLeft },
    { view: 'calendar' },
    { view: 'stats' },
    { view: 'settings' },
  ];
  return (
    <Modal open={open} onClose={onClose} title="المزيد">
      <div className="nav">
        {items.map(({ view, n }) => (
          <NavLink key={view} to={VIEWS[view].to} className={({ isActive }) => clsx('nav-item', isActive && 'active')} onClick={onClose} style={{ height: 48, fontSize: 16, '--vc': VIEWS[view].color } as CSSProperties}>
            <ViewIcon view={view} size={21} />{VIEWS[view].label}
            {!!n && <span className="count num">{n}</span>}
          </NavLink>
        ))}
        <button className="nav-item" style={{ height: 48, fontSize: 16, color: 'var(--danger)' }} onClick={() => { onClose(); void logout(); }}>
          <LogOut />تسجيل الخروج
        </button>
      </div>
    </Modal>
  );
}
