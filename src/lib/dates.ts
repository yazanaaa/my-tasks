// Dates are stored as local calendar days ("YYYY-MM-DD"), never as UTC instants,
// so a task due "today" stays today regardless of time zone.

export const WEEK_START = 0; // Sunday, the first working day in Jordan.

export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const DAY_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const DAY_LETTER = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
export const MONTH_NAMES = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toKey(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 86400000);
}

export function weekday(key: string): number {
  return fromKey(key).getDay();
}

export function startOfWeek(key: string): string {
  const offset = (weekday(key) - WEEK_START + 7) % 7;
  return addDays(key, -offset);
}

export function startOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function nextWeekday(from: string, day: number, allowSame = false): string {
  let diff = (day - weekday(from) + 7) % 7;
  if (diff === 0 && !allowSame) diff = 7;
  return addDays(from, diff);
}

export function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${period}`;
}

export function formatFullDate(key: string): string {
  const d = fromKey(key);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/** Short, relative label for a due date: اليوم، غدًا، أمس، السبت، 12 آب … */
export function relativeDay(key: string, today = todayKey()): string {
  const diff = diffDays(key, today);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غدًا';
  if (diff === -1) return 'أمس';
  const d = fromKey(key);
  if (diff > 1 && diff < 7) return DAY_NAMES[d.getDay()];
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'ليلة سعيدة';
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'نهارك سعيد';
  return 'مساء الخير';
}

/** Next due date for a recurring task after it is completed. */
export function nextOccurrence(rule: string, from: string | null, today = todayKey()): string {
  const step = (key: string): string => {
    if (rule === 'daily') return addDays(key, 1);
    if (rule === 'weekly') return addDays(key, 7);
    if (rule === 'monthly') return addMonths(key, 1);
    if (rule === 'yearly') return addMonths(key, 12);
    if (rule === 'weekdays') {
      let next = addDays(key, 1);
      while ([5, 6].includes(weekday(next))) next = addDays(next, 1);
      return next;
    }
    if (rule.startsWith('days:')) {
      const days = rule.slice(5).split(',').map(Number);
      let next = addDays(key, 1);
      while (!days.includes(weekday(next))) next = addDays(next, 1);
      return next;
    }
    const m = rule.match(/^every:(\d+):(day|week|month)$/);
    if (m) {
      const n = Number(m[1]);
      return m[2] === 'month' ? addMonths(key, n) : addDays(key, m[2] === 'week' ? n * 7 : n);
    }
    return addDays(key, 1);
  };
  let next = step(from ?? today);
  while (next < today) next = step(next);
  return next;
}

export function recurrenceLabel(rule: string | null): string {
  if (!rule) return '';
  const fixed: Record<string, string> = {
    daily: 'كل يوم',
    weekdays: 'أيام العمل',
    weekly: 'كل أسبوع',
    monthly: 'كل شهر',
    yearly: 'كل سنة',
  };
  if (fixed[rule]) return fixed[rule];
  if (rule.startsWith('days:')) {
    return `كل ${rule.slice(5).split(',').map((d) => DAY_NAMES[Number(d)]).join('، ')}`;
  }
  const m = rule.match(/^every:(\d+):(day|week|month)$/);
  if (m) {
    const unit = { day: ['يوم', 'يومين', 'أيام'], week: ['أسبوع', 'أسبوعين', 'أسابيع'], month: ['شهر', 'شهرين', 'أشهر'] }[m[2] as 'day'];
    const n = Number(m[1]);
    return n === 1 ? `كل ${unit[0]}` : n === 2 ? `كل ${unit[1]}` : `كل ${n} ${n <= 10 ? unit[2] : unit[0]}`;
  }
  return '';
}

/** Arabic count phrase: 1 يوم، يومين، 3 أيام، 11 يومًا. */
export function plural(n: number, [one, two, few, many]: [string, string, string, string]): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

export const daysLabel = (n: number) => plural(n, ['يوم', 'يومين', 'أيام', 'يومًا']);
export const ideasLabel = (n: number) => plural(n, ['فكرة', 'فكرتين', 'أفكار', 'فكرة']);

/** هلأ، قبل 5 دقايق، مبارح، قبل أسبوعين، 12 آب … Days are counted on the local calendar. */
export function timeAgo(ts: number, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - ts) / 60000);
  if (minutes < 1) return 'هلأ';
  if (minutes < 60) return `قبل ${plural(minutes, ['دقيقة', 'دقيقتين', 'دقايق', 'دقيقة'])}`;
  const date = new Date(ts);
  const days = diffDays(toKey(new Date(now)), toKey(date));
  if (days <= 0) return `قبل ${plural(Math.floor(minutes / 60), ['ساعة', 'ساعتين', 'ساعات', 'ساعة'])}`;
  if (days === 1) return 'مبارح';
  if (days < 7) return `قبل ${daysLabel(days)}`;
  if (days < 30) return `قبل ${plural(Math.floor(days / 7), ['أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعًا'])}`;
  const year = date.getFullYear();
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}${year === new Date(now).getFullYear() ? '' : ` ${year}`}`;
}
