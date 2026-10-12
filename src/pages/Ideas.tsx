import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Archive, ArrowUp, ChevronLeft, ClipboardPaste, Pin } from 'lucide-react';
import clsx from 'clsx';
import { addIdea, addIdeas, useStore } from '../store';
import { hashString, IDEA_ROTATION, pickIdeaColor, splitImport } from '../lib/ideas';
import { clearDraft, readDraft, writeDraft } from '../lib/outbox';
import { ideasLabel } from '../lib/dates';
import { useIdeaList } from '../lib/selectors';
import { PageTitle } from '../components/PageTitle';
import { IdeaWall, SparkCard } from '../components/IdeaCard';
import { AutoTextarea, Modal, useIsMobile } from '../components/ui';
import type { Idea } from '../types';

const PLACEHOLDERS = ['شو الفكرة اللي ببالك؟', 'اكتبها قبل ما تطير…', 'نص فكرة؟ اكتبها، بتكمّلها بعدين', 'ولا فكرة غريبة، هون مكانها'];
const HINT = 'Enter للحفظ · Shift+Enter لسطر جديد · #وسم للتصنيف';
const WEEK = 7 * 86400000;

type Filter = 'all' | 'pinned' | `#${string}`;

export function IdeasPage() {
  const all = useIdeaList();
  const [filter, setFilter] = useState<Filter>('all');
  const [importing, setImporting] = useState(false);

  const { live, converted, archived } = useMemo(() => {
    const out = { live: [] as Idea[], converted: [] as Idea[], archived: [] as Idea[] };
    for (const i of all) {
      if (i.archived) out.archived.push(i);
      else if (i.convertedAt) out.converted.push(i);
      else out.live.push(i);
    }
    return out;
  }, [all]);

  const { tags, pinnedCount, filterable } = useMemo(() => {
    const counts = new Map<string, number>();
    let pins = 0;
    for (const i of live) {
      if (i.pinned) pins += 1;
      for (const t of i.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return {
      tags: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6),
      pinnedCount: pins,
      filterable: pins > 0 || counts.size > 0,
    };
  }, [live]);

  // A chip that disappeared (its last idea archived, say) quietly falls back to «الكل».
  const active: Filter = filter === 'pinned' ? (pinnedCount ? filter : 'all')
    : filter !== 'all' && tags.some(([t]) => `#${t}` === filter) ? filter : 'all';

  const { pinned, rest } = useMemo(() => {
    const tag = active.startsWith('#') ? active.slice(1) : null;
    const match = (i: Idea) => !tag || i.tags.includes(tag);
    return {
      pinned: active === 'pinned' ? [] : live.filter((i) => i.pinned && match(i)),
      rest: live.filter((i) => (active === 'pinned' ? i.pinned : !i.pinned) && match(i)),
    };
  }, [live, active]);

  const now = Date.now();
  const thisWeek = live.filter((i) => now - i.createdAt < WEEK).length;
  const subtitle = live.length === 0 ? 'اكتبها قبل ما تطير'
    : live.length === 1 ? 'أول فكرة، والجاي أحلى'
    : `${ideasLabel(live.length)} لحد هلأ${thisWeek ? ` · ${thisWeek} هالأسبوع` : ''}${converted.length ? ` · ${converted.length} صارت شغل` : ''}`;

  // Saving while a filter hides the new card would rob the user of watching it land.
  const onSaved = (idea: Idea) => {
    if (active === 'pinned' || (active !== 'all' && !idea.tags.includes(active.slice(1)))) setFilter('all');
  };

  return (
    <div className="page wide ideas-page">
      <PageTitle
        view="ideas"
        title="الأفكار"
        subtitle={<span key={live.length} className="ideas-count">{subtitle}</span>}
        actions={(
          <button className="icon-btn" aria-label="الصق أفكار كثيرة" title="الصق أفكار كثيرة" onClick={() => setImporting(true)}>
            <ClipboardPaste />
          </button>
        )}
      />

      <IdeaComposer onSaved={onSaved} />

      {live.length === 0 ? (
        <IdeasEmpty onImport={() => setImporting(true)} />
      ) : (
        <>
          {active === 'all' && <SparkCard variant="ideas" />}

          {filterable && (
            <div className="habit-strip idea-filters" role="group" aria-label="تصفية الأفكار">
              <FilterChip on={active === 'all'} onClick={() => setFilter('all')}>الكل</FilterChip>
              {pinnedCount > 0 && (
                <FilterChip on={active === 'pinned'} onClick={() => setFilter('pinned')}>
                  <Pin />المثبّتة<span className="num faint">{pinnedCount}</span>
                </FilterChip>
              )}
              {tags.map(([tag, n]) => (
                <FilterChip
                  key={tag}
                  on={active === `#${tag}`}
                  color={IDEA_ROTATION[hashString(tag) % IDEA_ROTATION.length]}
                  onClick={() => setFilter(`#${tag}`)}
                >
                  <bdi>#{tag}</bdi><span className="num faint">{n}</span>
                </FilterChip>
              ))}
            </div>
          )}

          {pinned.length > 0 && (
            <>
              <h2 className="kicker idea-kicker"><Pin />المثبّتة</h2>
              <IdeaWall ideas={pinned} />
              {rest.length > 0 && <h2 className="kicker idea-kicker">كل الأفكار</h2>}
            </>
          )}
          {rest.length > 0 && <IdeaWall ideas={rest} />}
          {pinned.length === 0 && rest.length === 0 && <p className="faint idea-none">ما في أفكار بهالوسم</p>}
        </>
      )}

      <IdeaShelf icon={<ChevronLeft />} label="صارت شغل" ideas={converted} />
      <IdeaShelf icon={<Archive className="no-turn" />} label="المؤرشفة" ideas={archived} />

      {importing && <IdeaImport onClose={() => setImporting(false)} />}
    </div>
  );
}

function FilterChip({ on, color, onClick, children }: { on: boolean; color?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={clsx('habit-pill idea-filter', on && 'on')}
      style={color ? ({ '--c': color } as React.CSSProperties) : undefined}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ---------- Composer ---------- */

function IdeaComposer({ onSaved }: { onSaved: (idea: Idea) => void }) {
  const isMobile = useIsMobile();
  const ideas = useStore((s) => s.ideas);
  const [text, setText] = useState(() => readDraft('composer')?.text ?? '');
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  const boxRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef(false);
  const color = useMemo(() => pickIdeaColor(text, Object.values(ideas)), [text, ideas]);
  const hasText = !!text.trim();

  const save = () => {
    const idea = addIdea({ id: readDraft('composer')?.id, text, source: 'app' });
    if (!idea) return;
    clearDraft('composer');
    setText('');
    navigator.vibrate?.(8);
    onSaved(idea);
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Android keyboards send Enter as an input event (keyCode 229), not a usable keydown.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onBeforeInput = (e: InputEvent) => {
      if ((e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') && !shiftRef.current && !e.isComposing) {
        e.preventDefault();
        saveRef.current();
      }
    };
    el.addEventListener('beforeinput', onBeforeInput);
    return () => el.removeEventListener('beforeinput', onBeforeInput);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    shiftRef.current = e.shiftKey;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  return (
    <div ref={boxRef} className={clsx('idea-composer', hasText && 'has-text')} style={{ '--c': color } as React.CSSProperties}>
      <AutoTextarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          writeDraft('composer', e.target.value);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => { shiftRef.current = e.shiftKey; }}
        onBlur={() => { shiftRef.current = false; }}
        autoFocus={!isMobile}
        dir="auto"
        enterKeyHint="send"
        maxLength={4000}
        placeholder={placeholder}
        aria-label="الفكرة"
      />
      <div className="idea-composer-foot">
        <span className="idea-hint">{HINT}</span>
        <button
          type="button"
          className="idea-send"
          aria-label="احفظ"
          disabled={!hasText}
          onPointerDown={(e) => e.preventDefault()}
          onClick={save}
        >
          <ArrowUp strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

/* ---------- Empty state ---------- */

function IdeasEmpty({ onImport }: { onImport: () => void }) {
  return (
    <div className="ideas-empty">
      <div className="ghost-cards" aria-hidden>
        <div className="ghost-card">تطبيق يذكّرني أشرب مي</div>
        <div className="ghost-card">فيديو عن يومي بالشغل <span className="idea-tag"><bdi>#محتوى</bdi></span></div>
        <div className="ghost-card">فكرة لمشروع جانبي</div>
      </div>
      <h3 className="h2">هون بتعيش أفكارك</h3>
      <p className="muted">اكتب أي شي بيخطر ببالك، حتى لو نص فكرة. الترتيب بعدين — أو لا.</p>
      <button className="btn btn-soft" onClick={onImport}><ClipboardPaste />عندك أفكار بمكان تاني؟ الصقها هون</button>
    </div>
  );
}

/* ---------- «صارت شغل» / «المؤرشفة» ---------- */

function IdeaShelf({ icon, label, ideas }: { icon: ReactNode; label: string; ideas: Idea[] }) {
  const [open, setOpen] = useState(false);
  if (!ideas.length) return null;
  return (
    <div className="idea-shelf">
      <button className="collapse-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}{label} <span className="num">({ideas.length})</span>
      </button>
      {open && <IdeaWall ideas={ideas} />}
    </div>
  );
}

/* ---------- Bulk paste ---------- */

function IdeaImport({ onClose }: { onClose: () => void }) {
  const [raw, setRaw] = useState('');
  const parts = useMemo(() => splitImport(raw), [raw]);

  const save = () => {
    if (!parts.length) return;
    addIdeas(parts, 'import');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="الصق أفكارك"
      width={560}
      className="idea-import"
      footer={(
        <>
          {parts.length > 0 && <span key={parts.length} className="idea-import-count">رح تنحفظ {ideasLabel(parts.length)}</span>}
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={save} disabled={!parts.length}>احفظها</button>
        </>
      )}
    >
      <p className="muted idea-import-body">
        من الملاحظات، الواتساب، أي مكان. كل سطر فكرة، وإذا في سطر فاضي بين الفقرات بتصير كل فقرة فكرة.
      </p>
      <textarea
        className="textarea idea-import-input"
        dir="auto"
        autoFocus
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            save();
          }
        }}
        placeholder="الصق هون…"
        aria-label="الأفكار"
      />
    </Modal>
  );
}
