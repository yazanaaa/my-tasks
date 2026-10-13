import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, CalendarRange, ChartColumn, CircleCheck, Flame, FolderPlus, Inbox, Lightbulb, ListRestart, LogOut, Plus, Search,
  Settings, Sun, Folder,
} from 'lucide-react';
import clsx from 'clsx';
import {
  addIdea, logout, openIdeaCapture, openQuickAdd, selectIdea, selectTask, setPaletteOpen, toast, useStore,
} from '../store';
import { relativeDay, timeAgo } from '../lib/dates';
import { splitIdea } from '../lib/ideas';
import { useIdeaList, useProjectList, useTaskList } from '../lib/selectors';
import { openHabitForm, openProjectForm } from './Forms';
import { Modal } from './ui';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
  done?: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  if (!open) return null;
  return <Palette />;
}

function Palette() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const projects = useProjectList();
  const tasks = useTaskList();
  const ideas = useIdeaList();
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => setPaletteOpen(false);
  const go = (path: string) => () => navigate(path);

  const items = useMemo(() => {
    const nq = norm(q.trim());
    const match = (s: string) => !nq || norm(s).includes(nq);
    const nav: Item[] = [
      { id: 'n-today', group: 'انتقال', label: 'اليوم', icon: <Sun />, run: go('/') },
      { id: 'n-inbox', group: 'انتقال', label: 'المهام السريعة', icon: <Inbox />, run: go('/inbox') },
      { id: 'n-daily', group: 'انتقال', label: 'المهام اليومية', icon: <ListRestart />, run: go('/daily') },
      { id: 'n-upcoming', group: 'انتقال', label: 'القادم', icon: <CalendarRange />, run: go('/upcoming') },
      { id: 'n-ideas', group: 'انتقال', label: 'الأفكار', icon: <Lightbulb />, run: go('/ideas') },
      { id: 'n-cal', group: 'انتقال', label: 'التقويم', icon: <CalendarDays />, run: go('/calendar') },
      { id: 'n-stats', group: 'انتقال', label: 'الإحصائيات', icon: <ChartColumn />, run: go('/stats') },
      { id: 'n-settings', group: 'انتقال', label: 'الإعدادات', icon: <Settings />, run: go('/settings') },
      ...projects.map((p) => ({
        id: `p-${p.id}`, group: 'المشاريع', label: p.name, icon: <Folder style={{ color: p.color }} />, run: go(`/projects/${p.id}`),
      })),
    ];
    const actions: Item[] = [
      { id: 'a-idea', group: 'إجراءات', label: 'فكرة جديدة', hint: 'I', icon: <Lightbulb />, run: () => openIdeaCapture() },
      { id: 'a-task', group: 'إجراءات', label: 'مهمة جديدة', hint: 'Q', icon: <Plus />, run: () => openQuickAdd() },
      { id: 'a-project', group: 'إجراءات', label: 'مشروع جديد', icon: <FolderPlus />, run: () => openProjectForm() },
      { id: 'a-habit', group: 'إجراءات', label: 'عادة جديدة', icon: <Flame />, run: () => openHabitForm() },
      { id: 'a-logout', group: 'إجراءات', label: 'تسجيل الخروج', icon: <LogOut />, run: () => void logout() },
    ];
    const found: Item[] = nq
      ? tasks
        .filter((t) => match(t.title) || match(t.notes) || t.tags.some((g) => match(g)))
        .sort((a, b) => Number(a.completed) - Number(b.completed) || b.updatedAt - a.updatedAt)
        .slice(0, 30)
        .map((t) => ({
          id: `t-${t.id}`,
          group: 'المهام',
          label: t.title,
          hint: t.dueDate ? relativeDay(t.dueDate) : undefined,
          icon: <CircleCheck />,
          done: t.completed,
          run: () => selectTask(t.id),
        }))
      : [];
    const foundIdeas: Item[] = nq
      ? ideas.filter((i) => match(i.text)).slice(0, 20).map((i) => ({
        id: `i-${i.id}`,
        group: 'الأفكار',
        label: splitIdea(i.text).title,
        hint: timeAgo(i.createdAt),
        icon: <Lightbulb style={{ color: i.color }} />,
        done: i.archived || !!i.convertedAt,
        run: () => selectIdea(i.id),
      }))
      : [];
    const results = [...found, ...foundIdeas, ...nav.filter((i) => match(i.label)), ...actions.filter((i) => match(i.label))];
    const text = q.trim();
    if (!text) return results;
    // Anything typed can be kept as an idea: first when nothing matched (so Enter saves it), otherwise last.
    const chars = Array.from(text);
    const short = chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : text;
    const save: Item = {
      id: 'a-save-idea',
      group: 'فكرة',
      label: `احفظ «${short}» كفكرة`,
      icon: <Lightbulb />,
      run: () => {
        const idea = addIdea({ text: q, source: 'palette' });
        if (idea) toast('انحفظت الفكرة', { label: 'عرض', run: () => selectIdea(idea.id) });
      },
    };
    return results.length ? [...results, save] : [{ ...save, hint: 'Enter' }];
  }, [q, projects, tasks, ideas]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (item?: Item) => {
    if (!item) return;
    close();
    item.run();
  };

  let lastGroup = '';
  return (
    <Modal open onClose={close} width={600} className="palette">
      <div className="palette-input">
        <Search />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث في المهام والأفكار، انتقل، أو نفّذ أمرًا…"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); run(items[active]); }
          }}
        />
        <span className="kbd">Esc</span>
      </div>
      <div className="palette-list" ref={listRef}>
        {items.length === 0 && <p className="palette-empty">ما في نتائج لـ «{q}»</p>}
        {items.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <div key={item.id}>
              {header && <div className="menu-label">{header}</div>}
              <button
                data-i={i}
                className={clsx('menu-item', i === active && 'active-row', item.done && 'done')}
                onMouseMove={() => setActive(i)}
                onClick={() => run(item)}
              >
                {item.icon}
                <span className="palette-label">{item.label}</span>
                {item.hint && <span className="hint">{item.hint}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
