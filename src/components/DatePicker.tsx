import { useState } from 'react';
import { ArrowLeftToLine, CalendarX2, ChevronLeft, ChevronRight, Sun, Sunrise, CalendarRange } from 'lucide-react';
import clsx from 'clsx';
import {
  addDays, addMonths, DAY_LETTER, fromKey, MONTH_NAMES, nextWeekday, startOfMonth, startOfWeek, todayKey, WEEK_START,
  DAY_NAMES,
} from '../lib/dates';
import { MenuItem } from './ui';

/** Shortcut list + month grid. Calls onPick(null) to clear. */
export function DatePicker({ value, onPick }: { value: string | null; onPick: (d: string | null) => void }) {
  const today = todayKey();
  const [month, setMonth] = useState(startOfMonth(value ?? today));
  const gridStart = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const m = fromKey(month);
  const nextWeek = nextWeekday(today, WEEK_START);

  return (
    <div className="datepicker">
      <MenuItem icon={<Sun />} label="اليوم" hint={DAY_NAMES[fromKey(today).getDay()]} onClick={() => onPick(today)} />
      <MenuItem icon={<Sunrise />} label="غدًا" hint={DAY_NAMES[fromKey(addDays(today, 1)).getDay()]} onClick={() => onPick(addDays(today, 1))} />
      <MenuItem icon={<CalendarRange />} label="الأسبوع الجاي" hint={DAY_NAMES[fromKey(nextWeek).getDay()]} onClick={() => onPick(nextWeek)} />
      <MenuItem icon={<ArrowLeftToLine />} label="بعد شهر" onClick={() => onPick(addMonths(today, 1))} />
      {value && <MenuItem icon={<CalendarX2 />} label="بدون تاريخ" onClick={() => onPick(null)} danger />}
      <div className="menu-sep" />
      <div className="dp-head">
        <b>{MONTH_NAMES[m.getMonth()]} {m.getFullYear()}</b>
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-btn sm" aria-label="الشهر السابق" onClick={() => setMonth(addMonths(month, -1))}><ChevronRight /></button>
          <button className="icon-btn sm" aria-label="الشهر التالي" onClick={() => setMonth(addMonths(month, 1))}><ChevronLeft /></button>
        </div>
      </div>
      <div className="dp-grid">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="dp-dow">{DAY_LETTER[(WEEK_START + i) % 7]}</span>
        ))}
        {days.map((d) => (
          <button
            key={d}
            className={clsx('dp-day', d.slice(0, 7) !== month.slice(0, 7) && 'out', d === today && 'today', d === value && 'sel', d < today && 'past')}
            onClick={() => onPick(d)}
          >
            {fromKey(d).getDate()}
          </button>
        ))}
      </div>
    </div>
  );
}
