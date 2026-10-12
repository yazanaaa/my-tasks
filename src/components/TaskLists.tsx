import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { moveTasks, useStore } from '../store';
import { useSubtaskCounts } from '../lib/selectors';
import type { Task } from '../types';
import { positionAt, SortableItem, useGroupIds, type Move } from './SortableGroups';
import { TaskRow } from './TaskRow';

/** Rows of a SortableGroups group, in their live (mid-drag) order. */
export function SortableTaskRows({ groupId, showProject = true, showDate = true }: {
  groupId: string; showProject?: boolean; showDate?: boolean;
}) {
  const ids = useGroupIds(groupId);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useSubtaskCounts();
  return (
    <>
      {ids.map((id) => {
        const task = tasks[id];
        if (!task) return null;
        return (
          <SortableItem key={id} id={id}>
            {({ handleProps, dragging }) => (
              <TaskRow task={task} showProject={showProject} showDate={showDate} subtasks={subtasks[id]} handleProps={handleProps} dragging={dragging} />
            )}
          </SortableItem>
        );
      })}
    </>
  );
}

export function OverlayRow({ id, showProject = true }: { id: string; showProject?: boolean }) {
  const task = useStore((s) => s.tasks[id]);
  return task ? <TaskRow task={task} showProject={showProject} /> : null;
}

/** Persist a drop: new position between neighbors, plus whatever the destination implies. */
export function commitMove(move: Move, patch: Partial<Task> = {}) {
  const tasks = useStore.getState().tasks;
  const index = move.ids.indexOf(move.id);
  const neighbors = move.ids.filter((x) => x !== move.id).map((x) => tasks[x]).filter(Boolean);
  moveTasks([{ id: move.id, position: positionAt(neighbors, index), ...patch }]);
}

export function CompletedSection({ tasks, showProject = true, label = 'المنجزة' }: {
  tasks: Task[]; showProject?: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const subtasks = useSubtaskCounts();
  if (!tasks.length) return null;
  return (
    <div>
      <button className="collapse-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronLeft />
        {label} <span className="num">({tasks.length})</span>
      </button>
      {open && tasks.map((t) => <TaskRow key={t.id} task={t} showProject={showProject} subtasks={subtasks[t.id]} />)}
    </div>
  );
}
