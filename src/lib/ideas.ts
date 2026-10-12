import type { Idea } from '../types';
import { toKey } from './dates';

export const IDEA_MAX = 4000;
export const IDEA_PINK = '#EC4C9A';
export const PAPER = '#8E8E93';
export const IDEA_COLORS: { name: string; hue: string }[] = [
  { name: 'ليموني', hue: '#F5B400' },
  { name: 'خوخي', hue: '#FF8A00' },
  { name: 'وردي', hue: '#EC4C9A' },
  { name: 'ليلكي', hue: '#A259E6' },
  { name: 'سماوي', hue: '#2F7CF6' },
  { name: 'نعناعي', hue: '#2FB36A' },
  { name: 'ورقي', hue: '#8E8E93' },
];
export const IDEA_ROTATION = IDEA_COLORS.slice(0, 6).map((c) => c.hue); // Paper is never auto-assigned

const TAG_RE = /(?<=^|\s)#([^\s#@!]+)/g;
const TAG_TOKEN_RE = /(?<=^|\s)#[^\s#@!]+/g;
const TAG_TRAIL_RE = /[،,.؟?!:;)\]]+$/;
const DAY = 86400000;

// Cuts at n UTF-16 units without leaving half a surrogate pair behind.
function clip(s: string, n: number): string {
  const out = s.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
}

/** trim → cut to IDEA_MAX → trim, exactly what the server keeps. '' means "not saveable". */
export function cleanIdeaText(text: string): string {
  return clip(text.trim(), IDEA_MAX).trim();
}

/** #tags in the text, within the server's limits: unique, non-empty, ≤ 40 chars each, ≤ 20. */
export function extractTags(text: string): string[] {
  const tags: string[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const tag = clip(m[1].replace(TAG_TRAIL_RE, ''), 40);
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length === 20) break;
  }
  return tags;
}

/** Removes #tag tokens and collapses spaces; falls back to the trimmed input if nothing is left. */
export function stripTags(text: string): string {
  return text.replace(TAG_TOKEN_RE, '').replace(/\s+/g, ' ').trim() || text.trim();
}

/** title = first non-empty line; body = the lines after it. */
export function splitIdea(text: string): { title: string; body: string } {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return { title: '', body: '' };
  return { title: lines[first].trim(), body: lines.slice(first + 1).join('\n').trim() };
}

/** FNV-1a 32-bit, unsigned. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The first tag's hue, otherwise the rotation hue after `prev` (pink when there is none). */
export function nextIdeaColor(text: string, prev?: string | null): string {
  const [tag] = extractTags(text);
  if (tag) return IDEA_ROTATION[hashString(tag) % IDEA_ROTATION.length];
  const at = prev ? IDEA_ROTATION.findIndex((h) => h.toLowerCase() === prev.toLowerCase()) : -1;
  return at < 0 ? IDEA_PINK : IDEA_ROTATION[(at + 1) % IDEA_ROTATION.length];
}

/** Colour for a new idea: tag hash, or the next hue after the most recently created idea's. */
export function pickIdeaColor(text: string, ideas: Idea[]): string {
  let latest: Idea | undefined;
  for (const i of ideas) if (!latest || i.createdAt >= latest.createdAt) latest = i; // ties: the later insert
  return nextIdeaColor(text, latest?.color);
}

/** The daily «فاكر هالفكرة؟» pick. Derived from data only, so every device agrees on it. */
export function sparkFor(
  ideas: Idea[],
  { today, userId, offset = 0, now = Date.now() }: { today: string; userId: string; offset?: number; now?: number },
): { idea: Idea; poolSize: number } | null {
  const live = ideas.filter((i) => !i.archived && !i.convertedAt);
  if (live.length < 5) return null;
  if (ideas.some((i) => i.surfacedAt != null && toKey(new Date(i.surfacedAt)) === today)) return null;
  const pool = live
    .filter((i) => !i.pinned && now - i.createdAt >= 3 * DAY && (i.surfacedAt == null || now - i.surfacedAt >= 21 * DAY))
    .sort((a, b) => (a.surfacedAt ?? a.createdAt) - (b.surfacedAt ?? b.createdAt) || (a.id < b.id ? -1 : 1))
    .slice(0, 7);
  if (!pool.length) return null;
  return { idea: pool[(hashString(`${today}|${userId}`) + offset) % pool.length], poolSize: pool.length };
}

/** Android share target: title, text and url without repeats, one per line. */
export function joinShared(title: string | null, text: string | null, url: string | null): string {
  const t = title?.trim() ?? '';
  const x = text?.trim() ?? '';
  const u = url?.trim() ?? '';
  const parts = [t && !x.includes(t) && t !== u ? t : '', x, u && !x.includes(u) ? u : ''];
  return cleanIdeaText(parts.filter(Boolean).join('\n'));
}

/** Bulk paste: paragraphs when there are blank lines, otherwise lines; bullets stripped; ≤ 200. */
export function splitImport(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, '\n').trim(); // a trailing blank line alone doesn't mean paragraphs
  const parts = /\n\s*\n/.test(text) ? text.split(/\n\s*\n/) : text.split('\n');
  return parts
    .map((p) => cleanIdeaText(p.replace(/^\s*([-•*–]|\d+[.)])\s+/, '')))
    .filter(Boolean)
    .slice(0, 200);
}
