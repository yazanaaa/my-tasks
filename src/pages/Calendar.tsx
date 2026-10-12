import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import clsx from 'clsx';
import { openQuickAdd, selectTask, updateTask, useStore } from '../store';
import {
  addDays, addMonths, DAY_SHORT, formatFullDate, formatTime, fromKey, MONTH_NAMES, relativeDay, startOfMonth,
  startOfWeek, todayKey, WEEK_START,
} from '../lib/dates';
import { byAgenda, useSubtaskCounts, useTaskList } from '../lib/selectors';
import { TaskRow } from '../components/TaskRow';
import { InlineAdd } from '../components/QuickAdd';
import { useIsMobile } from '../components/ui';
import type { Task } from '../types';
import { PageTitle } from '../components/PageTitle';

const MAX_PILLS = 3;

export function CalendarPage() {
  const today = todayKey();
  const [month, setMonth] = useState(startOfMonth(today));
  const [selected, setSelected] = useState(today);
  const [dragId, setDragId] = useState<string | null>(null);
  const tasks = useTaskList();
  const projects = useStore((s) => s.projects);
  const subtasks = useSubtaskCounts();
  const mobile = useIsMobile();

  const gridStart = startOfWeek(month);
  const weeks = Math.ceil((((fromKey(month).getDay() - WEEK_START + 7) % 7) + new Date(fromKey(month).getFullYear(), fromKey(month).getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  const byDay = useMemo(() => {
    const out: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.dueDate || t.parentId) continue;
      (out[t.dueDate] ??= []).push(t);
    }
    for (const list of Object.values(out)) list.sort((a, b) => Number(a.completed) - Number(b.completed) || byAgenda(a, b));
    return out;
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragId(null);
    if (!over) return;
    const task = useStore.getState().tasks[String(active.id)];
    if (task && task.dueDate !== over.id) updateTask(task.id, { dueDate: String(over.id) });
  };

  const m = fromKey(month);
  const selectedTasks = byDay[selected] ?? [];
  const dragTask = dragId ? useStore.getState().tasks[dragId] : null;

  return (
    <div className="page wide">
      <PageTitle
        view="calendar"
        title={`${MONTH_NAMES[m.getMonth()]} ${m.getFullYear()}`}
        actions={<>
          <button className="btn btn-soft btn-sm" onClick={() => { setMonth(startOfMonth(today)); setSelected(today); }}>اليوم</button>
          <button className="icon-btn" aria-label="الشهر السابق" onClick={() => setMonth(addMonths(month, -1))}><ChevronRight /></button>
          <button className="icon-btn" aria-label="الشهر التالي" onClick={() => setMonth(addMonths(month, 1))}><ChevronLeft /></button>
        </>}
      />

      <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <div className="cal">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="cal-dow">{DAY_SHORT[(WEEK_START + i) % 7]}</div>
          ))}
          {days.map((d) => {
            const list = byDay[d] ?? [];
            const open = list.filter((t) => !t.completed);
            return (
              <DayCell
                key={d}
                day={d}
                out={d.slice(0, 7) !== month.slice(0, 7)}
                today={d === today}
                selected={d === selected}
                onSelect={() => setSelected(d)}
              >
                {mobile ? (
                  <div className="cal-dots">
                    {open.slice(0, 4).map((t) => <i key={t.id} style={{ background: t.projectId ? projects[t.projectId]?.color : 'var(--ink)' }} />)}
                  </div>
                ) : (
                  <>
                    {list.slice(0, MAX_PILLS).map((t) => (
                      <Pill key={t.id} task={t} color={t.projectId ? projects[t.projectId]?.color : undefined} />
                    ))}
                    {list.length > MAX_PILLS && <span className="cal-more num">+{list.length - MAX_PILLS}</span>}
                  </>
                )}
              </DayCell>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragTask ? <div className="cal-pill dragging">{dragTask.title}</div> : null}
        </DragOverlay>
      </DndContext>

      <section className="group cal-agenda">
        <div className="group-head">
          <h2 className="h2">{relativeDay(selected)}</h2>
          <span className="count">{formatFullDate(selected)}</span>
          <div className="actions">
            <button className="icon-btn sm" aria-label="مهمة في هذا اليوم" onClick={() => openQuickAdd({ dueDate: selected })}><Plus /></button>
          </div>
        </div>
        {selectedTasks.map((t) => <TaskRow key={t.id} task={t} showDate={false} subtasks={subtasks[t.id]} />)}
        <InlineAdd key={selected} defaults={{ dueDate: selected }} />
      </section>
    </div>
  );
}

function DayCell({ day, out, today, selected, onSelect, children }: {
  day: string; out: boolean; today: boolean; selected: boolean; onSelect: () => void; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  return (
    <div
      ref={setNodeRef}
      className={clsx('cal-cell', out && 'out', today && 'today', selected && 'sel', isOver && 'over')}
      onClick={onSelect}
      onDoubleClick={() => openQuickAdd({ dueDate: day })}
    >
      <span className="cal-num num">{fromKey(day).getDate()}</span>
      {children}
    </div>
  );
}

function Pill({ task, color }: { task: Task; color?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={clsx('cal-pill', task.completed && 'done', task.priority === 3 && 'hot', isDragging && 'ghost')}
      style={{ '--c': color ?? 'var(--ink)' } as React.CSSProperties}
      onClick={(e) => { e.stopPropagation(); selectTask(task.id); }}
    >
      {task.dueTime && <span className="num">{formatTime(task.dueTime).replace(/ [صم]$/, '')}</span>}
      {task.title}
    </button>
  );
}
