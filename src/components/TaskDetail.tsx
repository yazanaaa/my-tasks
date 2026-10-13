import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays, ChevronDown, Clock, CornerUpRight, Flag, Folder, Hash, Inbox, Lightbulb, ListChecks, Pin, PinOff, Plus,
  Repeat, Trash2, X,
} from 'lucide-react';
import clsx from 'clsx';
import { addTask, deleteTasks, selectIdea, selectTask, toggleTask, updateTask, useStore } from '../store';
import { DAY_LETTER, formatFullDate, recurrenceLabel, relativeDay, todayKey, toKey } from '../lib/dates';
import { splitIdea } from '../lib/ideas';
import { byPosition, useIdeaForTask, useProjectList } from '../lib/selectors';
import { PRIORITIES } from '../lib/theme';
import type { Priority, Task } from '../types';
import { AutoTextarea, Checkbox, MenuItem, Popover, usePopover } from './ui';
import { DatePicker } from './DatePicker';

const RECURRENCE_OPTIONS = [
  { value: '', label: 'لا تتكرر' },
  { value: 'daily', label: 'كل يوم' },
  { value: 'weekdays', label: 'أيام العمل (أحد–خميس)' },
  { value: 'weekly', label: 'كل أسبوع' },
  { value: 'every:2:week', label: 'كل أسبوعين' },
  { value: 'monthly', label: 'كل شهر' },
  { value: 'yearly', label: 'كل سنة' },
  { value: 'days', label: 'أيام محددة…' },
];

export function TaskDetailHost() {
  const id = useStore((s) => s.selectedTaskId);
  const task = useStore((s) => (id ? s.tasks[id] : undefined));
  useEffect(() => {
    if (!id) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.popover, .overlay') && selectTask(null);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [id]);
  if (!task) return null;
  return createPortal(
    <>
      <div className="drawer-scrim" onClick={() => selectTask(null)} />
      <aside className="drawer" role="dialog" aria-label="تفاصيل المهمة">
        <TaskDetail key={task.id} task={task} />
      </aside>
    </>,
    document.body,
  );
}

function TaskDetail({ task }: { task: Task }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [tagText, setTagText] = useState('');
  const [subText, setSubText] = useState('');
  const projects = useProjectList();
  const allSections = useStore((s) => s.sections);
  const allTasks = useStore((s) => s.tasks);
  const parent = task.parentId ? allTasks[task.parentId] : undefined;
  const sourceIdea = useIdeaForTask(task.id);
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const section = task.sectionId ? allSections[task.sectionId] : undefined;
  const subtasks = useMemo(
    () => Object.values(allTasks).filter((t) => t.parentId === task.id).sort(byPosition),
    [allTasks, task.id],
  );
  const datePop = usePopover();
  const projectPop = usePopover();

  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setNotes(task.notes), [task.notes]);

  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) updateTask(task.id, { title: t });
    else setTitle(task.title);
  };
  const saveNotes = () => notes !== task.notes && updateTask(task.id, { notes });

  const addTag = () => {
    const tag = tagText.trim().replace(/^#/, '');
    if (tag && !task.tags.includes(tag)) updateTask(task.id, { tags: [...task.tags, tag] });
    setTagText('');
  };
  const addSub = () => {
    const t = subText.trim();
    if (!t) return;
    addTask({ title: t, parentId: task.id, projectId: task.projectId });
    setSubText('');
  };

  const recValue = task.recurrence?.startsWith('days:') ? 'days' : task.recurrence ?? '';
  const recDays = task.recurrence?.startsWith('days:') ? task.recurrence.slice(5).split(',').map(Number) : [];
  const setRecurrence = (v: string) => {
    if (v === 'days') updateTask(task.id, { recurrence: `days:${new Date().getDay()}` });
    else updateTask(task.id, { recurrence: v || null, ...(v && !task.dueDate ? { dueDate: todayKey() } : {}) });
  };
  const toggleRecDay = (d: number) => {
    const next = recDays.includes(d) ? recDays.filter((x) => x !== d) : [...recDays, d].sort();
    if (next.length) updateTask(task.id, { recurrence: `days:${next.join(',')}` });
  };

  return (
    <div className="detail">
      <div className="detail-top">
        <button className="crumb" onClick={projectPop.toggle}>
          {project ? <i className="project-dot" style={{ '--c': project.color } as React.CSSProperties} /> : <Inbox />}
          <span>{project?.name ?? 'المهام السريعة'}{section && <span className="faint"> / {section.name}</span>}</span>
          <ChevronDown />
        </button>
        <span className="spacer" />
        {!task.parentId && (
          <button
            className={clsx('icon-btn', task.pinned && 'pin-on')}
            aria-label={task.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
            title={task.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
            aria-pressed={task.pinned}
            onClick={() => updateTask(task.id, { pinned: !task.pinned })}
          >
            {task.pinned ? <PinOff /> : <Pin />}
          </button>
        )}
        <button className="icon-btn" aria-label="حذف المهمة" onClick={() => deleteTasks([task.id])}><Trash2 /></button>
        <button className="icon-btn" aria-label="إغلاق" onClick={() => selectTask(null)}><X /></button>
      </div>

      <div className="detail-scroll">
        {parent && (
          <button className="parent-link" onClick={() => selectTask(parent.id)}>
            <CornerUpRight /> مهمة فرعية من: {parent.title}
          </button>
        )}
        {sourceIdea && (
          <button className="parent-link" onClick={() => selectIdea(sourceIdea.id)}>
            <Lightbulb /> من فكرة: {splitIdea(sourceIdea.text).title}
          </button>
        )}
        <div className="detail-title-row">
          <Checkbox checked={task.completed} onChange={() => toggleTask(task.id)} priority={task.priority} size={24} />
          <AutoTextarea
            className={clsx('detail-title', task.completed && 'done')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            aria-label="عنوان المهمة"
          />
        </div>

        <div className="props">
          <div className="prop">
            <span className="prop-label"><CalendarDays />التاريخ</span>
            <button className={clsx('prop-value', task.dueDate && 'set')} onClick={datePop.toggle}>
              {task.dueDate ? <>{relativeDay(task.dueDate)} <span className="faint">· {formatFullDate(task.dueDate)}</span></> : 'بدون تاريخ'}
            </button>
          </div>
          {task.dueDate && (
            <div className="prop">
              <span className="prop-label"><Clock />الوقت</span>
              <div className="row">
                <input
                  type="time"
                  className="prop-input"
                  value={task.dueTime ?? ''}
                  onChange={(e) => updateTask(task.id, { dueTime: e.target.value || null })}
                />
                {task.dueTime && <button className="icon-btn sm" aria-label="إزالة الوقت" onClick={() => updateTask(task.id, { dueTime: null })}><X /></button>}
              </div>
            </div>
          )}
          <div className="prop">
            <span className="prop-label"><Repeat />التكرار</span>
            <div className="stack" style={{ gap: 8 }}>
              <select className="prop-input" value={recValue} onChange={(e) => setRecurrence(e.target.value)}>
                {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                {recValue && !RECURRENCE_OPTIONS.some((o) => o.value === recValue) && (
                  <option value={recValue}>{recurrenceLabel(task.recurrence)}</option>
                )}
              </select>
              {recValue === 'days' && (
                <div className="weekday-picker">
                  {DAY_LETTER.map((l, d) => (
                    <button key={d} aria-pressed={recDays.includes(d)} onClick={() => toggleRecDay(d)}>{l}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="prop prop-prio">
            <span className="prop-label"><Flag />الأولوية</span>
            <div className="segmented">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  aria-pressed={task.priority === p.value}
                  className={`prio-seg p${p.value}`}
                  onClick={() => updateTask(task.id, { priority: p.value as Priority })}
                >
                  {p.value > 0 && <Flag />}{p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="prop">
            <span className="prop-label"><Hash />الوسوم</span>
            <div className="tags-edit">
              {task.tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                  <button aria-label={`إزالة ${t}`} onClick={() => updateTask(task.id, { tags: task.tags.filter((x) => x !== t) })}><X /></button>
                </span>
              ))}
              <input
                className="tag-input"
                value={tagText}
                placeholder="أضف وسم…"
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
              />
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h3 className="kicker">ملاحظات</h3>
          <AutoTextarea
            className="notes"
            value={notes}
            placeholder="أضف تفاصيل، روابط، أفكار…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
          />
        </div>

        {!task.parentId && (
          <div className="detail-section">
            <h3 className="kicker">
              <ListChecks /> المهام الفرعية
              {subtasks.length > 0 && <span className="num"> {subtasks.filter((s) => s.completed).length}/{subtasks.length}</span>}
            </h3>
            {subtasks.length > 0 && (
              <div className="subtask-bar"><i style={{ width: `${(subtasks.filter((s) => s.completed).length / subtasks.length) * 100}%` }} /></div>
            )}
            <div className="subtasks">
              {subtasks.map((s) => <SubtaskRow key={s.id} task={s} />)}
              <div className="subtask add">
                <Plus />
                <input
                  value={subText}
                  placeholder="أضف خطوة…"
                  onChange={(e) => setSubText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSub()}
                />
              </div>
            </div>
          </div>
        )}

        <p className="detail-foot faint">
          أُنشئت {relativeDay(toKey(new Date(task.createdAt)))}
          {task.completedAt && ` · أُنجزت ${relativeDay(toKey(new Date(task.completedAt)))}`}
        </p>
      </div>

      {datePop.open && (
        <Popover anchor={datePop.anchor} onClose={datePop.close} width={264}>
          <DatePicker value={task.dueDate} onPick={(d) => { updateTask(task.id, { dueDate: d, ...(d ? {} : { dueTime: null, recurrence: null }) }); datePop.close(); }} />
        </Popover>
      )}
      {projectPop.open && (
        <Popover anchor={projectPop.anchor} onClose={projectPop.close} width={260}>
          <MenuItem icon={<Inbox />} label="المهام السريعة" active={!task.projectId} onClick={() => { updateTask(task.id, { projectId: null }); projectPop.close(); }} />
          {projects.map((p) => {
            const secs = Object.values(allSections).filter((s) => s.projectId === p.id).sort(byPosition);
            return (
              <div key={p.id}>
                <MenuItem
                  icon={<i className="project-dot" style={{ '--c': p.color } as React.CSSProperties} />}
                  label={p.name}
                  active={task.projectId === p.id && !task.sectionId}
                  onClick={() => { updateTask(task.id, { projectId: p.id, sectionId: null }); projectPop.close(); }}
                />
                {secs.map((s) => (
                  <MenuItem
                    key={s.id}
                    icon={<Folder style={{ marginInlineStart: 14, width: 14 }} />}
                    label={s.name}
                    active={task.sectionId === s.id}
                    onClick={() => { updateTask(task.id, { projectId: p.id, sectionId: s.id }); projectPop.close(); }}
                  />
                ))}
              </div>
            );
          })}
        </Popover>
      )}
    </div>
  );
}

function SubtaskRow({ task }: { task: Task }) {
  const [title, setTitle] = useState(task.title);
  useEffect(() => setTitle(task.title), [task.title]);
  return (
    <div className={clsx('subtask', task.completed && 'done')}>
      <Checkbox checked={task.completed} onChange={() => toggleTask(task.id)} size={18} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => (title.trim() && title.trim() !== task.title ? updateTask(task.id, { title: title.trim() }) : setTitle(task.title))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button className="icon-btn sm" aria-label="حذف الخطوة" onClick={() => deleteTasks([task.id], { silent: true })}><X /></button>
    </div>
  );
}
