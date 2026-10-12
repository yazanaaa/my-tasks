// Natural-language quick add: "اجتماع بكرا الساعة 5 العصر #عمل @الموقع !!"
import type { Priority, Project } from '../types';
import {
  addDays, addMonths, formatTime, nextWeekday, recurrenceLabel, relativeDay, todayKey,
} from './dates';

export type TokenKind = 'date' | 'time' | 'priority' | 'tag' | 'project' | 'recurrence';

export interface Token {
  start: number;
  end: number;
  kind: TokenKind;
  label: string;
}

export interface Parsed {
  title: string;
  dueDate?: string;
  dueTime?: string;
  priority?: Priority;
  recurrence?: string;
  projectId?: string;
  tags: string[];
  tokens: Token[];
}

const B = '(?<=^|\\s)';
const E = '(?=$|\\s|[،,.؟?])';

const WEEKDAYS: [number, string][] = [
  [0, 'أحد|احد'],
  [1, 'اثنين|إثنين|اتنين'],
  [2, 'ثلاثاء|ثلاثا|تلات|تلاتا'],
  [3, 'أربعاء|اربعاء|اربعا|أربعا'],
  [4, 'خميس'],
  [5, 'جمعة|جمعه'],
  [6, 'سبت'],
];
const WD_ANY = WEEKDAYS.map(([, n]) => n).join('|');
const weekdayOf = (word: string) => WEEKDAYS.find(([, n]) => new RegExp(`^(?:${n})$`).test(word))![0];

const PRIORITY_LABEL = ['', 'أولوية منخفضة', 'أولوية متوسطة', 'أولوية عالية'];

// Arabic-Indic and Persian digits map 1:1 to ASCII, so string offsets stay valid.
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => String((c.charCodeAt(0) & 0xf) % 10));
}

function unitDays(unit: string, n: number, today: string): string {
  if (/^(يوم|أيام|ايام)$/.test(unit)) return addDays(today, n);
  if (/^(أسبوع|اسبوع|أسابيع|اسابيع)$/.test(unit)) return addDays(today, n * 7);
  return addMonths(today, n);
}

export function parseQuickAdd(input: string, projects: Project[] = [], today = todayKey()): Parsed {
  const text = normalizeDigits(input);
  const tokens: Token[] = [];
  const result: Parsed = { title: input.trim(), tags: [], tokens };

  const free = (start: number, end: number) => tokens.every((t) => end <= t.start || start >= t.end);
  // apply returns the chip label (null skips the match), optionally with a custom token length.
  const take = (re: RegExp, kind: TokenKind, apply: (m: RegExpExecArray) => string | [string, number] | null, all = false) => {
    const g = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const start = m.index;
      if (!m[0] || !free(start, start + m[0].length)) continue;
      const out = apply(m);
      if (out === null) continue;
      const [label, length] = Array.isArray(out) ? out : [out, m[0].length];
      tokens.push({ start, end: start + length, kind, label });
      if (!all) return;
    }
  };

  // Recurrence (before plain weekdays so "كل سبت" isn't read as a date).
  take(new RegExp(`${B}كل\\s+(?:يوم\\s+)?(?:ال)?(${WD_ANY})${E}`), 'recurrence', (m) => {
    const day = weekdayOf(m[1]);
    result.recurrence = `days:${day}`;
    result.dueDate ??= nextWeekday(today, day, true);
    return recurrenceLabel(result.recurrence);
  });
  take(new RegExp(`${B}(كل\\s+يوم|يومي(?:ًا|اً|ا)?|كل\\s+(?:أسبوع|اسبوع)|(?:أ|ا)سبوعي(?:ًا|اً|ا)?|كل\\s+شهر|شهري(?:ًا|اً|ا)?|كل\\s+سنة|سنوي(?:ًا|اً|ا)?|أيام\\s+العمل|ايام\\s+الدوام|أيام\\s+الدوام)${E}`),
    'recurrence', (m) => {
      const w = m[1];
      result.recurrence = /يوم|يومي/.test(w) ? 'daily'
        : /سبوع/.test(w) ? 'weekly'
          : /شهر/.test(w) ? 'monthly'
            : /سن/.test(w) ? 'yearly' : 'weekdays';
      return recurrenceLabel(result.recurrence);
    });

  // Dates.
  const setDate = (d: string) => {
    result.dueDate = d;
    return relativeDay(d, today);
  };
  take(new RegExp(`${B}بعد\\s+(?:بكرا|بكرة|بكره|غد|غدًا|غدا)${E}`), 'date', () => setDate(addDays(today, 2)));
  take(new RegExp(`${B}(اليوم|الليلة|الليله)${E}`), 'date', () => setDate(today));
  take(new RegExp(`${B}(بكرا|بكرة|بكره|بكرى|غدًا|غداً|غدا)${E}`), 'date', () => setDate(addDays(today, 1)));
  take(new RegExp(`${B}(?:(?:ال)?(?:أسبوع|اسبوع)\\s+(?:الجاي|القادم|المقبل|الجاية))${E}`), 'date', () => setDate(addDays(today, 7)));
  take(new RegExp(`${B}(?:(?:ال)?شهر\\s+(?:الجاي|القادم|المقبل))${E}`), 'date', () => setDate(addMonths(today, 1)));
  take(new RegExp(`${B}بعد\\s+(\\d{1,3})\\s+(يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|اسابيع|شهر|أشهر|اشهر|شهور)${E}`), 'date',
    (m) => setDate(unitDays(m[2], Number(m[1]), today)));
  take(new RegExp(`${B}بعد\\s+(يومين|أسبوعين|اسبوعين|شهرين)${E}`), 'date',
    (m) => setDate(unitDays(m[1].replace(/ين$/, ''), 2, today)));
  take(new RegExp(`${B}بعد\\s+(يوم|أسبوع|اسبوع|شهر)${E}`), 'date', (m) => setDate(unitDays(m[1], 1, today)));
  take(new RegExp(`${B}(?:يوم\\s+(?:ال)?|ال)(${WD_ANY})${E}`), 'date', (m) => setDate(nextWeekday(today, weekdayOf(m[1]))));
  take(new RegExp(`${B}(\\d{1,2})[/\\-.](\\d{1,2})(?:[/\\-.](\\d{2,4}))?${E}`), 'date', (m) => {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4));
    const key = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!m[3] && key(year) < today) year += 1;
    return setDate(key(year));
  });

  // Time: needs "الساعة", minutes, or a period word, so plain numbers in titles stay put.
  take(new RegExp(`${B}(?:(?:ع\\s*|على\\s+)?(?:الساعة|الساعه|ساعة)\\s*)?(\\d{1,2})(?::(\\d{2}))?\\s*(صباحًا|صباحاً|صباحا|الصبح|الصباح|ص|ظهرًا|ظهرا|الظهر|عصرًا|عصرا|العصر|مساءً|مساءا|مساء|المسا|المساء|م|بالليل|الليل|ليلًا|ليلا)?${E}`),
    'time', (m) => {
      const hasPrefix = /ساع/.test(m[0]);
      if (!hasPrefix && !m[2] && !m[3]) return null;
      let h = Number(m[1]);
      const min = Number(m[2] ?? 0);
      if (h > 23 || min > 59) return null;
      const p = m[3] ?? '';
      if (/^(ص|صباحًا|صباحاً|صباحا|الصبح|الصباح)$/.test(p)) {
        if (h === 12) h = 0;
      } else if (/ظهر/.test(p)) {
        if (h < 6) h += 12;
      } else if (p) {
        if (h < 12) h += 12;
      } else if (h >= 1 && h <= 6) {
        h += 12; // "الساعة 5" almost always means 5 in the afternoon.
      }
      result.dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      result.dueDate ??= today;
      return formatTime(result.dueTime);
    });

  // Priority: !, !!, !!! or !1 (highest) … !3.
  take(new RegExp(`${B}(!{1,3}|![1-3])${E}`), 'priority', (m) => {
    const v = m[1];
    const p = (/\d/.test(v) ? 4 - Number(v[1]) : v.length) as Priority;
    result.priority = p;
    return PRIORITY_LABEL[p];
  });

  // Tags.
  take(new RegExp(`${B}#([^\\s#@!]+)`), 'tag', (m) => {
    result.tags.push(m[1]);
    return `#${m[1]}`;
  }, true);

  // Project: longest project name that follows "@".
  take(new RegExp(`${B}@([^\\s@#!]*)`), 'project', (m) => {
    const after = text.slice(m.index + 1).toLowerCase();
    const sorted = projects.filter((p) => !p.archived).sort((a, b) => b.name.length - a.name.length);
    const exact = sorted.find((p) => after.startsWith(p.name.toLowerCase())
      && /^($|\s)/.test(after.slice(p.name.length)));
    const partial = !exact && m[1] ? sorted.find((p) => p.name.toLowerCase().startsWith(m[1].toLowerCase())) : undefined;
    const project = exact ?? partial;
    if (!project) return null;
    result.projectId = project.id;
    // Project names can contain spaces; the regex only captured the first word.
    return [project.name, exact ? project.name.length + 1 : m[0].length];
  });

  tokens.sort((a, b) => a.start - b.start);
  let title = '';
  let cursor = 0;
  for (const t of tokens) {
    title += input.slice(cursor, t.start);
    cursor = Math.max(cursor, t.end);
  }
  title += input.slice(cursor);
  title = title.replace(/\s+/g, ' ').trim();
  result.title = title || input.trim();
  return result;
}
