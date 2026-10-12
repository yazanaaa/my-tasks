import {
  memo, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type MouseEvent, type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Archive, ArchiveRestore, CloudOff, FolderKanban, Lightbulb, Link as LinkIcon, ListTodo, Pin, PinOff, Shuffle,
} from 'lucide-react';
import clsx from 'clsx';
import { archiveIdea, selectIdea, sparkAction, updateIdea, useStore } from '../store';
import { PAPER, sparkFor } from '../lib/ideas';
import { timeAgo, todayKey } from '../lib/dates';
import { useIdeaList } from '../lib/selectors';
import type { Idea } from '../types';
import { useIsMobile } from './ui';

const PENDING = 'محفوظة على جهازك، رح تنرفع لما يرجع النت';
const LEAVE_MS = 250;

/* ---------- Text ---------- */

type Tier = 't-short' | 't-mid' | 't-long';
const METRICS: Record<Tier, [fontSize: number, lineHeight: number]> = {
  't-short': [20, 1.35],
  't-mid': [16.5, 1.5],
  't-long': [14.5, 1.6],
};
const MAX_LINES = 9;

const tierOf = (text: string): Tier => (text.length <= 40 ? 't-short' : text.length <= 140 ? 't-mid' : 't-long');

// Links and #tags inside the text (tags follow the same rule as lib/ideas).
const TOKEN_RE = /(https?:\/\/\S+)|((?<=^|\s)#[^\s#@!]+)/gi;
const TAG_TRAIL_RE = /[،,.؟?!:;)\]]+$/;
const URL_TRAIL_RE = /[.,;:!?،؛؟'"»…]+$/;

/** Sentence punctuation stuck to the end of a link isn't part of it: «شوف https://x.com/a).» */
function trimUrl(raw: string): string {
  let url = raw.replace(URL_TRAIL_RE, '');
  while ((url.endsWith(')') && !url.includes('(')) || (url.endsWith(']') && !url.includes('['))) {
    url = url.slice(0, -1).replace(URL_TRAIL_RE, '');
  }
  return url;
}

/** The first http(s) link, for the domain chip. Anything that doesn't parse as http(s) gets no chip. */
function firstLink(text: string): { href: string; host: string } | null {
  const m = text.match(/https?:\/\/\S+/i);
  if (!m) return null;
  try {
    const url = new URL(trimUrl(m[0]));
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
    return { href: url.href, host: url.hostname.replace(/^www\./i, '') };
  } catch {
    return null;
  }
}

/** Tags and links are bidi-isolated so `#design` and URLs keep their own direction inside Arabic text. */
function rich(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    const isUrl = !!m[1];
    const core = isUrl ? trimUrl(m[0]) : m[0].replace(TAG_TRAIL_RE, '');
    if (core.length < (isUrl ? 9 : 2)) continue; // a bare "https://" or "#"
    if (start > at) out.push(text.slice(at, start));
    out.push(isUrl
      ? <bdi key={start} className="idea-url" dir="ltr">{core}</bdi>
      : <span key={start} className="idea-tag"><bdi>{core}</bdi></span>);
    at = start + core.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

function estimateLines(text: string, colWidth: number): number {
  const [fs] = METRICS[tierOf(text)];
  const perLine = Math.max(8, Math.floor((colWidth - 30) / (fs * 0.52)));
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
}

/* ---------- Relative time that keeps itself fresh ---------- */

// One shared timer for every card on screen, so «هلأ» turns into «قبل 5 دقايق» on its own.
const clock = { now: Date.now(), subs: new Set<() => void>(), timer: 0 as ReturnType<typeof setInterval> | 0 };

function subscribeClock(cb: () => void) {
  if (!clock.subs.size) {
    clock.now = Date.now();
    clock.timer = setInterval(() => {
      clock.now = Date.now();
      clock.subs.forEach((f) => f());
    }, 30_000);
  }
  clock.subs.add(cb);
  return () => {
    clock.subs.delete(cb);
    if (!clock.subs.size && clock.timer) clearInterval(clock.timer);
  };
}

function useTimeAgo(ts: number): string {
  return useSyncExternalStore(subscribeClock, () => timeAgo(ts, clock.subs.size ? clock.now : Date.now()));
}

/* ---------- Card ---------- */

export interface IdeaCardProps {
  idea: Idea;
  /** Position in its column, for the entrance stagger. */
  i?: number;
  /** Long enough (by estimate) to be cut at 9 lines. */
  clamped?: boolean;
}

export const IdeaCard = memo(function IdeaCard({ idea, i = 0, clamped = false }: IdeaCardProps) {
  // Only ideas saved a moment ago get the spring and the sparkle, never the ones from the cold load.
  const born = useRef(Date.now() - idea.createdAt < 2000).current;
  const pending = useStore((s) => !!s.pendingIdeas[idea.id]);
  const converted = useStore((s) => {
    if (!idea.convertedAt) return null;
    if (idea.taskId && s.tasks[idea.taskId]) return 'task';
    if (idea.projectId && s.projects[idea.projectId]) return 'project';
    return 'gone';
  });
  const ago = useTimeAgo(idea.createdAt);
  const [leaving, setLeaving] = useState(false);
  const [cut, setCut] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const link = useMemo(() => firstLink(idea.text), [idea.text]);
  const tier = tierOf(idea.text);
  const isPaper = idea.color.toLowerCase() === PAPER.toLowerCase();
  const nl = idea.text.indexOf('\n');

  // The fade only goes on text that really is cut, not on every card the estimate flagged.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || !clamped) {
      setCut(false);
      return;
    }
    const check = () => setCut(el.scrollHeight - el.clientHeight > 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clamped, idea.text]);

  const leave = (run: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      run();
      setLeaving(false);
    }, LEAVE_MS);
  };

  const open = (e: MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && e.currentTarget.contains(sel.anchorNode)) return; // selecting text, not opening
    selectIdea(idea.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    selectIdea(idea.id);
  };

  const live = !idea.archived && !idea.convertedAt;

  return (
    <div
      className={clsx('idea', tier, idea.pinned && 'pinned', idea.archived && 'archived', isPaper && 'paper', born && 'born', leaving && 'leaving')}
      style={{ '--c': idea.color, '--i': i } as React.CSSProperties}
      role="button"
      tabIndex={0}
      dir="auto"
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <div ref={textRef} className={clsx('idea-text', tier, clamped && 'clamped', cut && 'cut')}>
        {nl < 0 ? rich(idea.text) : (
          <>
            <span className="idea-first">{rich(idea.text.slice(0, nl))}</span>
            {'\n'}
            <span className="idea-rest">{rich(idea.text.slice(nl + 1))}</span>
          </>
        )}
      </div>

      {link && (
        <a className="idea-link" href={link.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          <LinkIcon />
          <span>{link.host}</span>
        </a>
      )}

      <div className="idea-foot">
        <span>{ago}</span>
        {pending && <span className="idea-pending" role="img" title={PENDING} aria-label={PENDING}><CloudOff /></span>}
        {converted === 'task' && <span className="chip accent"><ListTodo />صارت مهمة</span>}
        {converted === 'project' && <span className="chip accent"><FolderKanban />صارت مشروع</span>}
        {converted === 'gone' && <span className="chip accent">تحوّلت</span>}
      </div>

      {idea.pinned && <Pin className="idea-pin" />}

      <div className="idea-actions">
        {idea.archived ? (
          <button type="button" className="icon-btn sm" aria-label="استرجاع" title="استرجاع" onClick={leave(() => archiveIdea(idea.id, false))}>
            <ArchiveRestore />
          </button>
        ) : (
          <>
            {(live || idea.pinned) && (
              <button
                type="button"
                className="icon-btn sm"
                aria-label={idea.pinned ? 'فك التثبيت' : 'ثبّت'}
                title={idea.pinned ? 'فك التثبيت' : 'ثبّت'}
                onClick={(e) => {
                  e.stopPropagation();
                  updateIdea(idea.id, { pinned: !idea.pinned });
                }}
              >
                {idea.pinned ? <PinOff /> : <Pin />}
              </button>
            )}
            <button type="button" className="icon-btn sm" aria-label="أرشفة" title="أرشفة" onClick={leave(() => archiveIdea(idea.id))}>
              <Archive />
            </button>
          </>
        )}
      </div>
    </div>
  );
});

/* ---------- Masonry wall ---------- */

interface Placed { idea: Idea; lines: number }

/**
 * Oldest first into the shortest column, then each column is shown newest on top.
 * A new idea only ever lands on top of one column: no existing card changes place.
 */
function layoutWall(ideas: Idea[], width: number, gap: number): Placed[][] {
  const n = width >= 1000 ? 4 : width >= 700 ? 3 : width >= 300 ? 2 : 1;
  const colWidth = (width - gap * (n - 1)) / n;
  const cols = Array.from({ length: n }, () => ({ h: 0, items: [] as Placed[] }));
  for (let k = ideas.length - 1; k >= 0; k -= 1) {
    const idea = ideas[k];
    const lines = estimateLines(idea.text, colWidth);
    const [fs, lh] = METRICS[tierOf(idea.text)];
    const linkH = /https?:\/\//i.test(idea.text) ? 34 : 0;
    let best = cols[0];
    for (const c of cols) if (c.h < best.h) best = c;
    best.items.push({ idea, lines });
    best.h += 58 + Math.min(lines, MAX_LINES) * fs * lh + linkH + gap;
  }
  return cols.map((c) => c.items.reverse());
}

export function IdeaWall({ ideas }: { ideas: Idea[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const mobile = useIsMobile();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo(() => layoutWall(ideas, width, mobile ? 10 : 14), [ideas, width, mobile]);

  return (
    <div ref={ref} className="idea-wall">
      {columns.map((col, c) => (
        <div key={c} className="idea-col">
          {col.map(({ idea, lines }, i) => <IdeaCard key={idea.id} idea={idea} i={i} clamped={lines > MAX_LINES} />)}
        </div>
      ))}
    </div>
  );
}

/* ---------- «فاكر هالفكرة؟» ---------- */

type SparkMove = 'task' | 'pin' | 'archive' | 'later';

export function SparkCard({ variant }: { variant: 'ideas' | 'today' }) {
  const ideas = useIdeaList();
  const userId = useStore((s) => s.user?.id ?? '');
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const today = todayKey();
  const spark = useMemo(() => sparkFor(ideas, { today, userId, offset }), [ideas, today, userId, offset]);
  if (!spark) return null;
  const { idea, poolSize } = spark;

  // The card fades out first; the action (which hides it for the rest of the day) runs after.
  const act = (move: SparkMove) => () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      sparkAction(idea.id, move);
      setLeaving(false);
    }, LEAVE_MS);
  };

  return (
    <section
      className={clsx('spark', variant === 'today' && 'compact', leaving && 'leaving')}
      style={{ '--c': idea.color } as React.CSSProperties}
      aria-label="فاكر هالفكرة؟"
    >
      <div className="spark-kicker">
        <Lightbulb />
        فاكر هالفكرة؟
        <span className="faint">انكتبت {timeAgo(idea.createdAt)}</span>
      </div>
      <div
        key={idea.id}
        className="spark-text"
        dir="auto"
        role="button"
        tabIndex={0}
        onClick={() => selectIdea(idea.id)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          selectIdea(idea.id);
        }}
      >
        {rich(idea.text)}
      </div>
      <div className="spark-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={act('task')}><ListTodo />حوّلها لمهمة</button>
        <button type="button" className="btn btn-soft btn-sm" onClick={act('pin')}><Pin />ثبّتها</button>
        <button type="button" className="btn btn-soft btn-sm" onClick={act('archive')}><Archive />خلّصت منها</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={act('later')}>بعدين</button>
        {poolSize > 1 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOffset((o) => o + 1)}><Shuffle />وحدة غيرها</button>
        )}
        {variant === 'today' && <Link to="/ideas" className="link spark-all">كل الأفكار</Link>}
      </div>
    </section>
  );
}
