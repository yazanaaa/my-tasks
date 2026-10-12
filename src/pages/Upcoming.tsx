import { useMemo } from 'react';
import clsx from 'clsx';
import { addDays, DAY_NAMES, DAY_SHORT, diffDays, formatFullDate, fromKey, relativeDay, todayKey } from '../lib/dates';
import { byAgenda, useTaskList } from '../lib/selectors';
import { InlineAdd } from '../components/QuickAdd';
import { SortableGroup, SortableGroups } from '../components/SortableGroups';
import { commitMove, OverlayRow, SortableTaskRows } from '../components/TaskLists';
import { PageTitle } from '../components/PageTitle';

const DAYS = 14;
const LATER = 'later';

export function UpcomingPage() {
  const today = todayKey();
  const tasks = useTaskList();
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(today, i + 1)), [today]);
  const last = days[days.length - 1];

  const groups = useMemo(() => {
    const g: Record<string, string[]> = Object.fromEntries([...days, LATER].map((d) => [d, []]));
    const open = tasks.filter((t) => !t.completed && !t.parentId && t.dueDate && t.dueDate > today).sort(byAgenda);
    for (const t of open) {
      if (t.dueDate! <= last) g[t.dueDate!].push(t.id);
      else g[LATER].push(t.id);
    }
    g[LATER].sort((a, b) => {
      const ta = open.find((t) => t.id === a)!;
      const tb = open.find((t) => t.id === b)!;
      return ta.dueDate! < tb.dueDate! ? -1 : ta.dueDate! > tb.dueDate! ? 1 : 0;
    });
    return g;
  }, [tasks, days, today, last]);

  const scrollTo = (d: string) => document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page">
      <PageTitle view="upcoming" title="القادم" subtitle="الأسبوعين الجايين" />

      <div className="week-strip">
        {days.slice(0, 7).map((d) => {
          const n = groups[d].length;
          return (
            <button key={d} className={clsx('week-day', n > 0 && 'has')} onClick={() => scrollTo(d)}>
              <span className="faint">{DAY_SHORT[fromKey(d).getDay()]}</span>
              <b className="num">{fromKey(d).getDate()}</b>
              <span className="week-dots">{Array.from({ length: Math.min(n, 4) }, (_, i) => <i key={i} />)}</span>
            </button>
          );
        })}
      </div>

      <SortableGroups
        groups={groups}
        renderOverlay={(id) => <OverlayRow id={id} />}
        onMove={(m) => commitMove(m, m.groupId === LATER ? {} : { dueDate: m.groupId })}
      >
        {days.map((d) => {
          const diff = diffDays(d, today);
          const empty = groups[d].length === 0 && diff > 7;
          return (
            <section key={d} id={`day-${d}`} className={clsx('group day-group', empty && 'quiet')}>
              <div className="group-head">
                <h2 className="h2">{diff === 1 ? 'غدًا' : DAY_NAMES[fromKey(d).getDay()]}</h2>
                <span className="count">{diff === 1 ? formatFullDate(d) : relativeDay(d)}</span>
              </div>
              <SortableGroup id={d} className="group-drop">
                <SortableTaskRows groupId={d} showDate={false} />
              </SortableGroup>
              {!empty && <InlineAdd defaults={{ dueDate: d }} />}
            </section>
          );
        })}
        <section className="group">
          <div className="group-head">
            <h2 className="h2">لاحقًا</h2>
            <span className="count num">{groups[LATER].length}</span>
          </div>
          <SortableGroup id={LATER} className="group-drop">
            <SortableTaskRows groupId={LATER} />
          </SortableGroup>
        </section>
      </SortableGroups>
    </div>
  );
}
