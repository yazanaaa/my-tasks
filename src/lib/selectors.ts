import { useMemo } from 'react';
import { useStore } from '../store';
import { addDays, diffDays, todayKey, toKey, weekday } from './dates';
import type { Habit, Idea, Project, Section, Task } from '../types';

/** Sort for date-driven views: timed tasks first by time, then priority, then manual order. */
export function byAgenda(a: Task, b: Task): number {
  if (a.dueTime && b.dueTime && a.dueTime !== b.dueTime) return a.dueTime < b.dueTime ? -1 : 1;
  if (!!a.dueTime !== !!b.dueTime) return a.dueTime ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.position - b.position;
}

export const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
export const byCompletedDesc = (a: Task, b: Task) => (b.completedAt ?? 0) - (a.completedAt ?? 0);

export function useTaskList(): Task[] {
  const tasks = useStore((s) => s.tasks);
  return useMemo(() => Object.values(tasks), [tasks]);
}

export function useProjectList(includeArchived = false): Project[] {
  const projects = useStore((s) => s.projects);
  return useMemo(
    () => Object.values(projects).filter((p) => includeArchived || !p.archived).sort(byPosition),
    [projects, includeArchived],
  );
}

export function useSectionsOf(projectId: string): Section[] {
  const sections = useStore((s) => s.sections);
  return useMemo(
    () => Object.values(sections).filter((x) => x.projectId === projectId).sort(byPosition),
    [sections, projectId],
  );
}

export function useHabitList(): Habit[] {
  const habits = useStore((s) => s.habits);
  return useMemo(() => Object.values(habits).filter((h) => !h.archived).sort(byPosition), [habits]);
}

/** All loaded ideas, newest first. */
export function useIdeaList(): Idea[] {
  const ideas = useStore((s) => s.ideas);
  return useMemo(
    () => Object.values(ideas).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)),
    [ideas],
  );
}

/** The idea a task was made from, if any. */
export function useIdeaForTask(taskId: string): Idea | undefined {
  const ideas = useStore((s) => s.ideas);
  return useMemo(() => Object.values(ideas).find((i) => i.taskId === taskId), [ideas, taskId]);
}

/** Subtask progress keyed by parent id. */
export function useSubtaskCounts(): Record<string, { done: number; total: number }> {
  const tasks = useTaskList();
  return useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const t of tasks) {
      if (!t.parentId) continue;
      out[t.parentId] ??= { done: 0, total: 0 };
      out[t.parentId].total += 1;
      if (t.completed) out[t.parentId].done += 1;
    }
    return out;
  }, [tasks]);
}

export function useCounts() {
  const tasks = useTaskList();
  return useMemo(() => {
    const today = todayKey();
    let todayCount = 0;
    let overdue = 0;
    let inbox = 0;
    const perProject: Record<string, number> = {};
    for (const t of tasks) {
      if (t.completed || t.parentId) continue;
      if (t.dueDate && t.dueDate <= today) todayCount += 1;
      if (t.dueDate && t.dueDate < today) overdue += 1;
      if (!t.projectId) inbox += 1;
      else perProject[t.projectId] = (perProject[t.projectId] ?? 0) + 1;
    }
    return { today: todayCount, overdue, inbox, perProject };
  }, [tasks]);
}

export function isScheduled(habit: Habit, date: string): boolean {
  return habit.days.includes(weekday(date));
}

/** Current streak in scheduled days. Today only counts once done; missing today doesn't break it yet. */
export function habitStreak(habit: Habit, logs: Record<string, true>, today = todayKey()): number {
  let streak = 0;
  let day = logs[`${habit.id}|${today}`] ? today : addDays(today, -1);
  const floor = addDays(today, -400);
  while (day >= floor) {
    if (isScheduled(habit, day)) {
      if (logs[`${habit.id}|${day}`]) streak += 1;
      else break;
    }
    day = addDays(day, -1);
  }
  return streak;
}

export function habitBestStreak(habit: Habit, logs: Record<string, true>, today = todayKey()): number {
  let best = 0;
  let run = 0;
  for (let i = 400; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    if (!isScheduled(habit, day)) continue;
    if (logs[`${habit.id}|${day}`]) best = Math.max(best, ++run);
    else if (day !== today) run = 0;
  }
  return best;
}

/** Share of scheduled days done over the last `days` days (since the habit was created). */
export function habitRate(habit: Habit, logs: Record<string, true>, days = 30, today = todayKey()): number {
  const createdKey = toKey(new Date(habit.createdAt));
  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < days; i += 1) {
    const day = addDays(today, -i);
    if (day < createdKey && !logs[`${habit.id}|${day}`]) continue;
    if (!isScheduled(habit, day)) continue;
    if (day === today && !logs[`${habit.id}|${day}`]) continue;
    scheduled += 1;
    if (logs[`${habit.id}|${day}`]) done += 1;
  }
  return scheduled ? done / scheduled : 0;
}

export function dueTone(task: Task, today = todayKey()): 'overdue' | 'today' | 'soon' | 'later' | null {
  if (!task.dueDate) return null;
  const d = diffDays(task.dueDate, today);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d < 7) return 'soon';
  return 'later';
}
