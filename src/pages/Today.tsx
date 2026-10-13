import { useMemo } from 'react';
import { PartyPopper, Pin, Star } from 'lucide-react';
import { moveTasks, openQuickAdd, useStore } from '../store';
import { formatFullDate, greeting, todayKey, toKey } from '../lib/dates';
import { byAgenda, byCompletedDesc, byPinned, useSubtaskCounts, useTaskList } from '../lib/selectors';
import { TaskRow } from '../components/TaskRow';
import { InlineAdd } from '../components/QuickAdd';
import { commitMove, CompletedSection, OverlayRow, SortableTaskRows } from '../components/TaskLists';
import { SortableGroup, SortableGroups } from '../components/SortableGroups';
import { SparkCard } from '../components/IdeaCard';
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

  const { pinned, overdue, todays, done } = useMemo(() => {
    const top = tasks.filter((t) => !t.parentId);
    return {
      // Pinned tasks with no date (or a later one) surface here; today's and overdue ones stay in their groups.
      pinned: top.filter((t) => t.pinned && !t.completed && (!t.dueDate || t.dueDate > today)).sort(byPinned),
      overdue: top.filter((t) => !t.completed && t.dueDate && t.dueDate < today)
        .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : byAgenda(a, b))),
      todays: top.filter((t) => !t.completed && t.dueDate === today).sort(byAgenda),
      done: top.filter((t) => t.completed && t.completedAt && toKey(new Date(t.completedAt)) === today).sort(byCompletedDesc),
    };
  }, [tasks, today]);

  const total = overdue.length + todays.length + done.length;
  const todayGroups = useMemo(() => ({ today: todays.map((t) => t.id) }), [todays]);
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="page">
      <PageTitle
        view="today"
        title="اليوم"
        subtitle={<>{greeting()}{firstName ? `، ${firstName}` : ''} · {formatFullDate(today)}</>}
        actions={total > 0 ? <Ring done={done.length} total={total} /> : undefined}
      />


      {pinned.length > 0 && (
        <section className="group first">
          <div className="group-head">
            <h2 className="h2 pinned-head"><Pin />مثبّتة</h2>
            <span className="count num">{pinned.length}</span>
          </div>
          {pinned.map((t) => <TaskRow key={t.id} task={t} subtasks={subtasks[t.id]} />)}
        </section>
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

      <section className={overdue.length || pinned.length ? 'group' : 'group first'}>
        {(overdue.length > 0 || pinned.length > 0) && (
          <div className="group-head">
            <h2 className="h2">لليوم</h2>
            <span className="count num">{todays.length}</span>
          </div>
        )}
        <SortableGroups groups={todayGroups} renderOverlay={(id) => <OverlayRow id={id} />} onMove={(m) => commitMove(m)}>
          <SortableGroup id="today" className="group-drop">
            <SortableTaskRows groupId="today" showDate={false} />
          </SortableGroup>
        </SortableGroups>
        <InlineAdd defaults={{ dueDate: today }} />
        {todays.length === 0 && overdue.length === 0 && (
          done.length > 0 ? (
            <EmptyState color="var(--hue-green)" icon={<PartyPopper />} title="خلّصت كل شي لليوم" body="شغل نظيف. استرح أو خطّط لبكرا." />
          ) : (
            <EmptyState
              color="var(--hue-amber)"
              icon={<Star fill="currentColor" />}
              title="يومك فاضي"
              body="أضف أول مهمة لليوم، أو اختار مهام من «المهام السريعة» والمشاريع."
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
