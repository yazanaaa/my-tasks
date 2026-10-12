import { useMemo } from 'react';
import { Check, PartyPopper, Star } from 'lucide-react';
import clsx from 'clsx';
import { moveTasks, openQuickAdd, toggleHabit, useStore } from '../store';
import { formatFullDate, greeting, todayKey, toKey } from '../lib/dates';
import { byAgenda, byCompletedDesc, habitStreak, isScheduled, useHabitList, useSubtaskCounts, useTaskList } from '../lib/selectors';
import { TaskRow } from '../components/TaskRow';
import { InlineAdd } from '../components/QuickAdd';
import { CompletedSection } from '../components/TaskLists';
import { SparkCard } from '../components/IdeaCard';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/PageTitle';
import { EmptyState } from '../components/ui';

function Ring({ done, total }: { done: number; total: number }) {
  const r = 22;
  const len = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div className="today-ring" title={`${done} من ${total}`}>
      <svg viewBox="0 0 52 52">
        <circle className="track" cx="26" cy="26" r={r} />
        <circle className="bar" cx="26" cy="26" r={r} strokeDasharray={len} strokeDashoffset={len * (1 - pct)} />
      </svg>
      <b className="num">{done}/{total}</b>
    </div>
  );
}

export function TodayPage() {
  const today = todayKey();
  const user = useStore((s) => s.user)!;
  const tasks = useTaskList();
  const subtasks = useSubtaskCounts();
  const habits = useHabitList();
  const logs = useStore((s) => s.habitLogs);

  const { overdue, todays, done } = useMemo(() => {
    const top = tasks.filter((t) => !t.parentId);
    return {
      overdue: top.filter((t) => !t.completed && t.dueDate && t.dueDate < today)
        .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : byAgenda(a, b))),
      todays: top.filter((t) => !t.completed && t.dueDate === today).sort(byAgenda),
      done: top.filter((t) => t.completed && t.completedAt && toKey(new Date(t.completedAt)) === today).sort(byCompletedDesc),
    };
  }, [tasks, today]);

  const todaysHabits = habits.filter((h) => isScheduled(h, today));
  const total = overdue.length + todays.length + done.length;
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="page">
      <PageTitle
        view="today"
        title="اليوم"
        subtitle={<>{greeting()}{firstName ? `، ${firstName}` : ''} · {formatFullDate(today)}</>}
        actions={total > 0 ? <Ring done={done.length} total={total} /> : undefined}
      />

      {todaysHabits.length > 0 && (
        <div className="habit-strip">
          {todaysHabits.map((h) => {
            const on = !!logs[`${h.id}|${today}`];
            const streak = habitStreak(h, logs, today);
            return (
              <button key={h.id} className={clsx('habit-pill', on && 'on')} style={{ '--c': h.color } as React.CSSProperties} onClick={() => toggleHabit(h.id, today)}>
                <span className="habit-pill-icon">{on ? <Check strokeWidth={3} /> : <Icon name={h.icon} />}</span>
                <span>{h.name}</span>
                {streak > 0 && <span className="num faint">{streak}</span>}
              </button>
            );
          })}
        </div>
      )}

      {overdue.length > 0 && (
        <section className="group">
          <div className="group-head hot">
            <h2 className="h2">متأخرة</h2>
            <span className="count num">{overdue.length}</span>
            <div className="actions">
              <button className="btn btn-ghost btn-sm" onClick={() => moveTasks(overdue.map((t) => ({ id: t.id, dueDate: today })))}>
                نقل الكل لليوم
              </button>
            </div>
          </div>
          {overdue.map((t) => <TaskRow key={t.id} task={t} subtasks={subtasks[t.id]} />)}
        </section>
      )}

      <section className={overdue.length ? 'group' : 'group first'}>
        {overdue.length > 0 && (
          <div className="group-head">
            <h2 className="h2">لليوم</h2>
            <span className="count num">{todays.length}</span>
          </div>
        )}
        {todays.map((t) => <TaskRow key={t.id} task={t} showDate={false} subtasks={subtasks[t.id]} />)}
        <InlineAdd defaults={{ dueDate: today }} />
        {todays.length === 0 && overdue.length === 0 && (
          done.length > 0 ? (
            <EmptyState color="var(--hue-green)" icon={<PartyPopper />} title="خلّصت كل شي لليوم" body="شغل نظيف. استرح أو خطّط لبكرا." />
          ) : (
            <EmptyState
              color="var(--hue-amber)"
              icon={<Star fill="currentColor" />}
              title="يومك فاضي"
              body="أضف أول مهمة لليوم، أو اختار مهام من الوارد والمشاريع."
              action={<button className="btn btn-primary" onClick={() => openQuickAdd({ dueDate: today })}>مهمة لليوم</button>}
            />
          )
        )}
      </section>

      <SparkCard variant="today" />

      <CompletedSection tasks={done} label="أنجزت اليوم" />
    </div>
  );
}
