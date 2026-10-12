import type { Idea } from '../types';

// Ideas that haven't reached the server yet, and text typed but not saved, live in localStorage
// so a reload, a crash or a dead connection never loses them. Storage can be full or blocked:
// every access is guarded, reads then come back empty and writes are skipped.

export type DraftSlot = 'capture' | 'composer';
export interface IdeaDraft { id: string; slot: DraftSlot; text: string; at: number; userId: string | null }

const USER_KEY = 'mt:last-user';
const SLOTS: DraftSlot[] = ['capture', 'composer'];
const outboxKey = (userId: string) => `mt:idea-outbox:${userId}`;
const draftKey = (slot: DraftSlot) => `mt:idea-draft:${slot}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readJson(key: string): unknown {
  const raw = read(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* ---------- Last signed-in user ---------- */

export function rememberUser(id: string): void {
  write(USER_KEY, id);
}

export function lastUserId(): string | null {
  return read(USER_KEY) || null;
}

export function forgetUser(): void {
  write(USER_KEY, null);
}

/* ---------- Outbox (per user, so it can only ever flush into its own account) ---------- */

// When storage refuses a write this tab keeps the outbox in memory instead,
// so ideas it still holds keep syncing for as long as it stays open.
const unsaved = new Map<string, Idea[]>();

const isIdea = (v: unknown): v is Idea => {
  const i = v as Partial<Idea> | null;
  return !!i && typeof i.id === 'string' && typeof i.text === 'string' && Array.isArray(i.tags)
    && typeof i.createdAt === 'number';
};

export function readOutbox(userId: string): Idea[] {
  const kept = unsaved.get(userId);
  if (kept) return kept;
  const list = readJson(outboxKey(userId));
  return Array.isArray(list) ? list.filter(isIdea) : [];
}

/** Removes the key when the outbox is empty. */
export function writeOutbox(userId: string, items: Idea[]): void {
  if (write(outboxKey(userId), items.length ? JSON.stringify(items) : null)) unsaved.delete(userId);
  else unsaved.set(userId, items);
}

/* ---------- Drafts ---------- */

export function readDraft(slot: DraftSlot): IdeaDraft | null {
  const d = readJson(draftKey(slot)) as Partial<IdeaDraft> | null;
  if (!d || typeof d.id !== 'string' || typeof d.text !== 'string') return null;
  return {
    id: d.id,
    slot,
    text: d.text,
    at: typeof d.at === 'number' ? d.at : 0,
    userId: typeof d.userId === 'string' ? d.userId : null,
  };
}

/** Keeps the draft's id across edits, so saving it twice can't make two ideas. Blank text clears it. */
export function writeDraft(slot: DraftSlot, text: string): void {
  if (!text.trim()) {
    clearDraft(slot);
    return;
  }
  const draft: IdeaDraft = {
    id: readDraft(slot)?.id ?? crypto.randomUUID(),
    slot,
    text,
    at: Date.now(),
    userId: lastUserId(),
  };
  write(draftKey(slot), JSON.stringify(draft));
}

export function clearDraft(slot: DraftSlot): void {
  write(draftKey(slot), null);
}

export function readAllDrafts(): IdeaDraft[] {
  return SLOTS.map(readDraft).filter((d): d is IdeaDraft => d !== null);
}
