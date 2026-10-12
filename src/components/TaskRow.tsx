import { memo, useState, type HTMLAttributes } from 'react';
import {
  CalendarDays, CalendarClock, Copy, GripVertical, ListChecks, MoreHorizontal, Repeat, StickyNote, Trash2, Flag, Star,
} from 'lucide-react';
import clsx from 'clsx';
import { addTask, deleteTasks, selectTask, toggleTask, updateTask, useStore } from '../store';
import { formatTime, recurrenceLabel, relativeDay, todayKey } from '../lib/dates';
import { dueTone } from '../lib/selectors';
import { PRIORITIES } from '../lib/theme';
import type { Priority, Task } from '../types';
import { Checkbox, MenuItem, Popover, usePopover } from './ui';
import { DatePicker } from './DatePicker';

export interface TaskRowProps {
  task: Task;
  showProject?: boolean;
  showDate?: boolean;
  subtasks?: { done: number; total: number };
  handleProps?: HTMLAttributes<HTMLElement>;
  dragging?: boolean;
  compact?: boolean;
}

export const TaskRow = memo(function TaskRow({
  task, showProject = true, showDate = true, subtasks, handleProps, dragging, compact,
}: TaskRowProps) {
  const project = useStore((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  const selected = useStore((s) => s.selectedTaskId === task.id);
  const [settling, setSettling] = useState(false);
  const menu = usePopover();
  const datePop = usePopover();
  const tone = dueTone(task);
  const checked = task.completed || settling;

  const onCheck = () => {
    if (task.completed) return toggleTask(task.id);
    // Let the check animation play before the row leaves the list.
    setSettling(true);
    setTimeout(() => {
      toggleTask(task.id);
      setSettling(false);
    }, 380);
  };

  const hasMeta = (showDate && task.dueDate) || task.recurrence || (subtasks && subtasks.total) || task.notes
    || (showProject && project) || task.tags.length;

  return (
    <div
      className={clsx('task', checked && 'done', settling && 'settling', selected && 'selected', dragging && 'dragging', compact && 'compact')}
      onClick={() => selectTask(task.id)}
    >
      {handleProps && (
        <span className="task-handle" {...handleProps} onClick={(e) => e.stopPropagation()} aria-label="سحب لإعادة الترتيب">
          <GripVertical />
        </span>
      )}
      <Checkbox checked={checked} onChange={onCheck} priority={task.priority} />
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {hasMeta ? (
          <div className="task-meta">
            {showDate && task.dueDate && (
              <span className={clsx('meta-date', tone)}>
                {tone === 'today' ? <Star /> : <CalendarDays />}
                {relativeDay(task.dueDate)}
                {task.dueTime && <span className="num"> · {formatTime(task.dueTime)}</span>}
              </span>
            )}
            {!showDate && task.dueTime && <span className="meta-date today num">{formatTime(task.dueTime)}</span>}
            {task.recurrence && <span title={recurrenceLabel(task.recurrence)}><Repeat /></span>}
            {subtasks && subtasks.total > 0 && (
              <span className="num"><ListChecks />{subtasks.done}/{subtasks.total}</span>
            )}
            {task.notes && <span><StickyNote /></span>}
            {task.tags.map((t) => <span key={t} className="meta-tag">#{t}</span>)}
            {showProject && project && (
              <span className="meta-project"><i className="project-dot" style={{ '--c': project.color } as React.CSSProperties} />{project.name}</span>
            )}
          </div>
        ) : null}
      </div>
      <div className="task-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn sm" aria-label="تغيير التاريخ" onClick={datePop.toggle}><CalendarClock /></button>
        <button className="icon-btn sm" aria-label="خيارات المهمة" onClick={menu.toggle}><MoreHorizontal /></button>
      </div>

      {datePop.open && (
        <Popover anchor={datePop.anchor} onClose={datePop.close} width={264}>
          <DatePicker value={task.dueDate} onPick={(d) => { updateTask(task.id, { dueDate: d, ...(d ? {} : { dueTime: null }) }); datePop.close(); }} />
        </Popover>
      )}
      {menu.open && (
        <Popover anchor={menu.anchor} onClose={menu.close} width={230}>
          <div onClick={(e) => e.stopPropagation()}>
            {task.dueDate !== todayKey() && (
              <MenuItem icon={<Star color="var(--hue-amber)" fill="var(--hue-amber)" />} label="لليوم" onClick={() => { updateTask(task.id, { dueDate: todayKey() }); menu.close(); }} />
            )}
            <div className="menu-label">الأولوية</div>
            <div className="prio-row">
              {[...PRIORITIES].reverse().map((p) => (
                <button
                  key={p.value}
                  className={clsx('prio-btn', `p${p.value}`, task.priority === p.value && 'on')}
                  title={p.label}
                  onClick={() => { updateTask(task.id, { priority: p.value as Priority }); menu.close(); }}
                >
                  <Flag />
                </button>
              ))}
            </div>
            <div className="menu-sep" />
            <MenuItem
              icon={<Copy />}
              label="نسخ المهمة"
              onClick={() => {
                const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = task;
                addTask({ ...rest, position: task.position + 0.5, completed: false, completedAt: null });
                menu.close();
              }}
            />
            <MenuItem icon={<Trash2 />} label="حذف" danger onClick={() => { deleteTasks([task.id]); menu.close(); }} />
          </div>
        </Popover>
      )}
    </div>
  );
});
