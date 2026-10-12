import { useState } from 'react';
import { Check, Flame, MoreHorizontal, Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import clsx from 'clsx';
import { deleteHabit, toggleHabit, useStore } from '../store';
import { addDays, DAY_LETTER, DAY_NAMES, daysLabel, fromKey, startOfWeek, todayKey } from '../lib/dates';
import { habitBestStreak, habitRate, habitStreak, isScheduled, useHabitList } from '../lib/selectors';
import { Icon } from '../components/Icon';
import { openHabitForm } from '../components/Forms';
import { confirmDialog, EmptyState, MenuItem, Popover, usePopover } from '../components/ui';
import type { Habit } from '../types';
import { PageTitle } from '../components/PageTitle';

export function HabitsPage() {
  const habits = useHabitList();
  const logs = useStore((s) => s.habitLogs);
  const today = todayKey();
  const scheduledToday = habits.filter((h) => isScheduled(h, today));
  const doneToday = scheduledToday.filter((h) => logs[`${h.id}|${today}`]).length;

  return (
    <div className="page">
      <PageTitle
        view="habits"
        title="العادات"
        subtitle={scheduledToday.length ? <span className="num">أنجزت اليوم {doneToday} من {scheduledToday.length}</span> : undefined}
        actions={<button className="btn btn-primary" onClick={() => openHabitForm()}><Plus />عادة جديدة</button>}
      />

      {habits.length === 0 ? (
        <EmptyState
          color="var(--hue-orange)"
          icon={<Flame fill="currentColor" />}
          title="ابنِ عادة صغيرة"
          body="عادات يومية أو بأيام محددة، مع سلسلة التزام وخريطة تقدم. ابدأ بشي سهل."
          action={<button className="btn btn-primary" onClick={() => openHabitForm()}>أول عادة</button>}
        />
      ) : (
        <div className="habits">
          {habits.map((h) => <HabitCard key={h.id} habit={h} />)}
        </div>
      )}
    </div>
  );
}

function HabitCard({ habit }: { habit: Habit }) {
  const logs = useStore((s) => s.habitLogs);
  const [open, setOpen] = useState(false);
  const menu = usePopover();
  const today = todayKey();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const streak = habitStreak(habit, logs, today);
  const best = habitBestStreak(habit, logs, today);
  const rate = Math.round(habitRate(habit, logs, 30, today) * 100);

  const remove = async () => {
    menu.close();
    if (await confirmDialog({ title: `حذف «${habit.name}»؟`, message: 'رح ينحذف سجل الالتزام كامل.', confirmLabel: 'حذف العادة' })) deleteHabit(habit.id);
  };

  return (
    <article className="habit" style={{ '--c': habit.color } as React.CSSProperties}>
      <div className="habit-main">
        <button className="habit-icon" onClick={() => setOpen((o) => !o)} aria-label="عرض التفاصيل"><Icon name={habit.icon} /></button>
        <div className="habit-info" onClick={() => setOpen((o) => !o)}>
          <h3 className="h2">{habit.name}</h3>
          <div className="habit-stats">
            <span className={clsx(streak > 0 && 'accent')}><Flame />{streak ? daysLabel(streak) : 'ابدأ السلسلة'}</span>
            <span className="faint">{habit.days.length === 7 ? 'كل يوم' : habit.days.map((d) => DAY_NAMES[d]).join('، ')}</span>
          </div>
        </div>
        <div className="habit-week">
          {week.map((d) => {
            const on = !!logs[`${habit.id}|${d}`];
            const sched = isScheduled(habit, d);
            return (
              <button
                key={d}
                className={clsx('habit-day', on && 'on', !sched && 'off', d === today && 'today')}
                onClick={() => toggleHabit(habit.id, d)}
                aria-label={`${DAY_NAMES[fromKey(d).getDay()]}${on ? ' (منجزة)' : ''}`}
              >
                <span>{DAY_LETTER[fromKey(d).getDay()]}</span>
                <i>{on && <Check strokeWidth={3.2} />}</i>
              </button>
            );
          })}
        </div>
        <button className="icon-btn sm" aria-label="خيارات العادة" onClick={menu.toggle}><MoreHorizontal /></button>
      </div>
      {open && (
        <div className="habit-detail">
          <div className="metrics">
            <div className="metric"><span>السلسلة الحالية</span><b className="num">{streak}</b></div>
            <div className="metric"><span><Trophy />أطول سلسلة</span><b className="num">{best}</b></div>
            <div className="metric"><span>الالتزام (30 يوم)</span><b className="num">{rate}%</b></div>
          </div>
          <Heatmap habit={habit} logs={logs} />
        </div>
      )}
      {menu.open && (
        <Popover anchor={menu.anchor} onClose={menu.close} width={200}>
          <MenuItem icon={<Pencil />} label="تعديل" onClick={() => { menu.close(); openHabitForm(habit); }} />
          <MenuItem icon={<Trash2 />} label="حذف" danger onClick={remove} />
        </Popover>
      )}
    </article>
  );
}

function Heatmap({ habit, logs }: { habit: Habit; logs: Record<string, true> }) {
  const today = todayKey();
  const weeks = 26;
  const start = addDays(startOfWeek(today), -(weeks - 1) * 7);
  return (
    <div className="heatmap" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 14px))` }}>
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} className="heat-col">
          {Array.from({ length: 7 }, (_, d) => {
            const day = addDays(start, w * 7 + d);
            if (day > today) return <i key={d} className="future" />;
            const on = !!logs[`${habit.id}|${day}`];
            return <i key={d} className={clsx(on && 'on', !isScheduled(habit, day) && 'off')} title={day} />;
          })}
        </div>
      ))}
    </div>
  );
}
