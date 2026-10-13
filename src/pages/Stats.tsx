import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CircleAlert, Flame, Star } from 'lucide-react';
import clsx from 'clsx';
import { addDays, DAY_LETTER, DAY_NAMES, formatFullDate, fromKey, relativeDay, startOfWeek, todayKey, toKey } from '../lib/dates';
import { useProjectList, useTaskList } from '../lib/selectors';
import { PageTitle } from '../components/PageTitle';

const HEAT_STEPS = ['var(--fill)', '#bcd2ee', '#7aa6dc', '#3a76c4', '#1b5299'];
const heatLevel = (n: number) => (n === 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4);

export function StatsPage() {
  const tasks = useTaskList();
  const projects = useProjectList();
  const today = todayKey();

  const data = useMemo(() => {
    const perDay: Record<string, number> = {};
    let overdue = 0;
    for (const t of tasks) {
      if (t.parentId) continue;
      if (t.completed && t.completedAt) {
        const k = toKey(new Date(t.completedAt));
        perDay[k] = (perDay[k] ?? 0) + 1;
      } else if (!t.completed && t.dueDate && t.dueDate < today) overdue += 1;
    }
    const weekStart = startOfWeek(today);
    let week = 0;
    let lastWeek = 0;
    for (const [k, n] of Object.entries(perDay)) {
      if (k >= weekStart && k <= today) week += n;
      else if (k >= addDays(weekStart, -7) && k < weekStart) lastWeek += n;
    }
    // Productive streak: consecutive days with at least one completion (today may still be pending).
    let streak = 0;
    let d = perDay[today] ? today : addDays(today, -1);
    while (perDay[d]) {
      streak += 1;
      d = addDays(d, -1);
    }
    const byWeekday = Array(7).fill(0) as number[];
    for (let i = 0; i < 90; i += 1) {
      const k = addDays(today, -i);
      byWeekday[fromKey(k).getDay()] += perDay[k] ?? 0;
    }
    return { perDay, overdue, week, lastWeek, streak, byWeekday };
  }, [tasks, today]);

  const projectStats = useMemo(() => projects.map((p) => {
    const mine = tasks.filter((t) => t.projectId === p.id && !t.parentId);
    const done = mine.filter((t) => t.completed).length;
    return { project: p, done, total: mine.length };
  }).filter((x) => x.total > 0), [projects, tasks]);

  const delta = data.week - data.lastWeek;

  return (
    <div className="page">
      <PageTitle view="stats" title="الإحصائيات" subtitle="نظرة على إنجازك" />

      <div className="metrics big">
        <div className="metric" style={{ '--c': 'var(--hue-amber)' } as React.CSSProperties}>
          <span><Star fill="currentColor" />أنجزت اليوم</span><b className="num">{data.perDay[today] ?? 0}</b>
        </div>
        <div className="metric" style={{ '--c': 'var(--hue-green)' } as React.CSSProperties}>
          <span><CalendarCheck />هذا الأسبوع</span>
          <b className="num">{data.week}</b>
          <small className={clsx('num', delta > 0 && 'accent')}>{delta === 0 ? 'مثل الأسبوع الماضي' : `${delta > 0 ? 'أكثر' : 'أقل'} بـ ${Math.abs(delta)} من الأسبوع الماضي`}</small>
        </div>
        <div className="metric" style={{ '--c': 'var(--hue-orange)' } as React.CSSProperties}>
          <span><Flame fill="currentColor" />أيام إنتاج متتالية</span><b className="num">{data.streak}</b>
        </div>
        <div className="metric" style={{ '--c': 'var(--hue-red)' } as React.CSSProperties}>
          <span><CircleAlert />متأخرة الآن</span><b className={clsx('num', data.overdue > 0 && 'accent')}>{data.overdue}</b>
        </div>
      </div>

      <section className="chart-card">
        <h2 className="h2">آخر 14 يوم</h2>
        <p className="faint chart-sub">عدد المهام المنجزة يوميًا</p>
        <DailyBars perDay={data.perDay} today={today} />
      </section>

      <section className="chart-card">
        <h2 className="h2">خريطة الإنجاز</h2>
        <p className="faint chart-sub">كل مربع يوم، وكلما غمق اللون أنجزت أكثر</p>
        <CompletionHeatmap perDay={data.perDay} today={today} />
      </section>

      <section className="chart-card">
        <h2 className="h2">أكثر أيامك إنتاجًا</h2>
        <p className="faint chart-sub">مجموع آخر 90 يوم</p>
        <WeekdayBars values={data.byWeekday} />
      </section>

      {projectStats.length > 0 && (
        <section className="chart-card">
          <h2 className="h2">تقدّم المشاريع</h2>
          <div className="hbars">
            {projectStats.map(({ project, done, total }) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="hbar">
                <span className="hbar-label"><i className="project-dot" style={{ '--c': project.color } as React.CSSProperties} />{project.name}</span>
                <span className="hbar-track"><i style={{ width: `${(done / total) * 100}%`, background: project.color }} /></span>
                <b className="num">{done}/{total}</b>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DailyBars({ perDay, today }: { perDay: Record<string, number>; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const values = days.map((d) => perDay[d] ?? 0);
  const max = Math.max(4, ...values);
  const W = 640;
  const H = 180;
  const pad = { top: 22, bottom: 26 };
  const slot = W / days.length;
  const bw = Math.min(28, slot - 10);
  const y = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="المهام المنجزة في آخر 14 يوم">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={W} y={y(t) - 4} className="axis" textAnchor="start">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          // RTL: oldest day on the right, today on the left.
          const cx = W - slot * (i + 0.5);
          const v = values[i];
          const top = y(v);
          const base = y(0);
          const h = base - top;
          const r = Math.min(4, h / 2);
          return (
            <g key={d} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" />
              {v > 0 && (
                <path
                  d={`M${cx - bw / 2},${base} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${base} Z`}
                  className={clsx('bar', d === today && 'today', hover === i && 'hover')}
                />
              )}
              <text x={cx} y={H - 8} className={clsx('axis', d === today && 'strong')} textAnchor="middle">{DAY_LETTER[fromKey(d).getDay()]}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ insetInlineStart: `${((hover + 0.5) / days.length) * 100}%` }}>
          <b className="num">{values[hover]}</b> مهمة
          <span className="faint">{relativeDay(days[hover])}</span>
        </div>
      )}
    </div>
  );
}

function CompletionHeatmap({ perDay, today }: { perDay: Record<string, number>; today: string }) {
  const weeks = 26;
  const start = addDays(startOfWeek(today), -(weeks - 1) * 7);
  return (
    <>
      <div className="heatmap tall" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 14px))` }}>
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="heat-col">
            {Array.from({ length: 7 }, (_, d) => {
              const day = addDays(start, w * 7 + d);
              if (day > today) return <i key={d} className="future" />;
              const n = perDay[day] ?? 0;
              return <i key={d} style={{ background: HEAT_STEPS[heatLevel(n)] }} title={`${formatFullDate(day)}: ${n} مهمة`} />;
            })}
          </div>
        ))}
      </div>
      <div className="heat-legend">
        <span className="faint">أقل</span>
        {HEAT_STEPS.map((c) => <i key={c} style={{ background: c }} />)}
        <span className="faint">أكثر</span>
      </div>
    </>
  );
}

function WeekdayBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const best = values.indexOf(Math.max(...values));
  return (
    <div className="hbars">
      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
        <div key={d} className="hbar">
          <span className="hbar-label">{DAY_NAMES[d]}</span>
          <span className="hbar-track"><i style={{ width: `${(values[d] / max) * 100}%`, background: d === best && values[d] > 0 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, var(--surface))' }} /></span>
          <b className="num">{values[d]}</b>
        </div>
      ))}
    </div>
  );
}
