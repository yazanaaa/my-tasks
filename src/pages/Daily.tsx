import { useEffect, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ListRestart, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import {
  addDailyItems, deleteDailyItem, isDailyDone, reorderDailyItems, resetDaily, toggleDailyItem, updateDailyItem, useStore,
} from '../store';
import { DAILY_RESET_HOUR, dailyBoundary } from '../lib/dates';
import { byPosition } from '../lib/selectors';
import type { DailyItem } from '../types';
import { PageTitle } from '../components/PageTitle';
import { positionAt, SortableGroup, SortableGroups, SortableItem, useGroupIds } from '../components/SortableGroups';
import { Checkbox, EmptyState } from '../components/ui';

const LINE_MARK_RE = /^\s*(?:[-•*–·▪◦]|\[[ xX]?\]|[☐☑✓✔]|\d+[.)])\s*/;

/** The latest 5 AM, kept fresh: it moves on at the next 5 AM and whenever the tab comes back. */
function useDailyBoundary(): number {
  const [boundary, setBoundary] = useState(dailyBoundary);
  useEffect(() => {
    const refresh = () => setBoundary(dailyBoundary());
    const timer = setTimeout(refresh, boundary + 86_400_000 - Date.now() + 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [boundary]);
  return boundary;
}

export function DailyPage() {
  const all = useStore((s) => s.dailyItems);
  const boundary = useDailyBoundary();
  const items = useMemo(() => Object.values(all).sort(byPosition), [all]);
  const groups = useMemo(() => ({ daily: items.map((i) => i.id) }), [items]);
  const done = items.filter((i) => isDailyDone(i, boundary)).length;

  const onMove = ({ id, ids }: { id: string; ids: string[] }) => {
    const index = ids.indexOf(id);
    const neighbors = ids.filter((x) => x !== id).map((x) => all[x]).filter(Boolean);
    reorderDailyItems([{ id, position: positionAt(neighbors, index) }]);
  };

  return (
    <div className="page">
      <PageTitle
        view="daily"
        title="المهام اليومية"
        subtitle={`بترجع من جديد كل يوم الساعة ${DAILY_RESET_HOUR} الصبح`}
        actions={items.length > 0 ? (
          <>
            <span className="daily-progress num">{done}/{items.length}</span>
            <button className="btn btn-soft btn-sm" onClick={resetDaily} disabled={done === 0} title="رجّع كل البنود مش مشطوبة">
              <RotateCcw />إعادة
            </button>
          </>
        ) : undefined}
      />

      {items.length > 0 && (
        <div className="daily-bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
          <i style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}

      <SortableGroups groups={groups} onMove={onMove} renderOverlay={(id) => (all[id] ? <DailyRow item={all[id]} done={isDailyDone(all[id], boundary)} /> : null)}>
        <SortableGroup id="daily" className="group-drop">
          <DailyRows all={all} boundary={boundary} />
        </SortableGroup>
      </SortableGroups>

      <DailyAdd />

      {items.length === 0 && (
        <EmptyState
          color="var(--hue-teal)"
          icon={<ListRestart />}
          title="رتّب روتينك اليومي"
          body={`حط الأشياء اللي بتعملها كل يوم، واشطب عليها وانت ماشي. كل يوم الساعة ${DAILY_RESET_HOUR} الصبح بترجع كلها من جديد.`}
        />
      )}
      {items.length > 0 && done === items.length && <p className="daily-done">خلّصت يومية اليوم. بكرا الساعة {DAILY_RESET_HOUR} الصبح بتبلّش من جديد.</p>}
    </div>
  );
}

function DailyRows({ all, boundary }: { all: Record<string, DailyItem>; boundary: number }) {
  const ids = useGroupIds('daily');
  return (
    <>
      {ids.map((id) => all[id] && (
        <SortableItem key={id} id={id}>
          {({ dragging }) => <DailyRow item={all[id]} done={isDailyDone(all[id], boundary)} dragging={dragging} />}
        </SortableItem>
      ))}
    </>
  );
}

function DailyRow({ item, done, dragging }: { item: DailyItem; done: boolean; dragging?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const save = () => {
    setEditing(false);
    const next = title.trim();
    if (next && next !== item.title) updateDailyItem(item.id, { title: next });
    else setTitle(item.title);
  };
  return (
    <div className={clsx('task daily-row', done && 'done', dragging && 'dragging')} onClick={() => !editing && toggleDailyItem(item.id)}>
      <Checkbox checked={done} onChange={() => toggleDailyItem(item.id)} />
      <div className="task-body">
        {editing ? (
          <input
            className="daily-edit"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
              else if (e.key === 'Escape') { setTitle(item.title); setEditing(false); }
            }}
          />
        ) : (
          <div className="task-title" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>{item.title}</div>
        )}
      </div>
      <div className="task-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn sm" aria-label="تعديل البند" title="تعديل" onClick={() => setEditing(true)}><Pencil /></button>
        <button className="icon-btn sm" aria-label="حذف البند" title="حذف" onClick={() => deleteDailyItem(item.id)}><Trash2 /></button>
      </div>
    </div>
  );
}

/** Add row: Enter adds one; pasting several lines adds one item per line. */
function DailyAdd() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) return;
    addDailyItems([text.trim().slice(0, 300)]);
    setText('');
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setText('');
      setOpen(false);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const lines = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n').split('\n')
      .map((l) => l.replace(LINE_MARK_RE, '').trim().slice(0, 300)).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    if (text.trim()) lines.unshift(text.trim());
    addDailyItems(lines.slice(0, 200));
    setText('');
  };

  if (!open) {
    return (
      <button className="inline-add" onClick={() => setOpen(true)}>
        <span className="plus"><Plus /></span>
        أضف بند
      </button>
    );
  }
  return (
    <div className="inline-add-box">
      <input
        className="inline-add-input"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onPaste={onPaste}
        onBlur={() => !text.trim() && setOpen(false)}
        placeholder="مثال: أشرب لترين مي"
        enterKeyHint="done"
      />
      <div className="row-end">
        <button className="btn btn-ghost btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { setText(''); setOpen(false); }}>إلغاء</button>
        <button className="btn btn-primary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={!text.trim()}>إضافة</button>
      </div>
    </div>
  );
}
