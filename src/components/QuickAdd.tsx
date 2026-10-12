import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { CalendarDays, Clock, Flag, Folder, Hash, Inbox, Plus, Repeat } from 'lucide-react';
import clsx from 'clsx';
import { addTask, closeQuickAdd, deleteTasks, openIdeaCapture, selectTask, toast, useStore, type QuickAddDefaults } from '../store';
import { parseQuickAdd, type Parsed, type TokenKind } from '../lib/parse';
import { relativeDay, tasksLabel } from '../lib/dates';
import { useProjectList } from '../lib/selectors';
import type { Priority, Project, Task } from '../types';
import { MenuItem, Modal, Popover, usePopover } from './ui';
import { DatePicker } from './DatePicker';
import { CaptureModeSwitch } from './IdeaCapture';

const KIND_ICON: Record<TokenKind, typeof CalendarDays> = {
  date: CalendarDays, time: Clock, priority: Flag, tag: Hash, project: Folder, recurrence: Repeat,
};

export function ParsedChips({ parsed }: { parsed: Parsed }) {
  if (!parsed.tokens.length) return null;
  return (
    <div className="parsed">
      {parsed.tokens.map((t) => {
        const I = KIND_ICON[t.kind];
        return <span key={`${t.kind}${t.start}`} className={clsx('chip', t.kind === 'priority' || t.kind === 'date' ? 'accent' : '')}><I />{t.label}</span>;
      })}
    </div>
  );
}

function build(parsed: Parsed, defaults: QuickAddDefaults, extra: Partial<Task> = {}): Partial<Task> & { title: string } {
  const projectId = parsed.projectId ?? defaults.projectId ?? null;
  return {
    title: parsed.title,
    projectId,
    sectionId: parsed.projectId && parsed.projectId !== defaults.projectId ? null : defaults.sectionId ?? null,
    dueDate: parsed.dueDate ?? defaults.dueDate ?? null,
    dueTime: parsed.dueTime ?? null,
    priority: parsed.priority ?? 0,
    recurrence: parsed.recurrence ?? null,
    tags: parsed.tags,
    ...extra,
  };
}

const LINE_MARK_RE = /^\s*(?:[-•*–·▪◦]|\[[ xX]?\]|[☐☑✓✔]|\d+[.)])\s*/;

/** Keep-style paste: text with several lines becomes one task per line, each parsed like typed input.
 *  The first and last lines join whatever surrounds the cursor. Returns false (normal paste) for one line. */
function pasteAsTasks(
  e: ClipboardEvent<HTMLInputElement>,
  projects: Project[],
  make: (parsed: Parsed) => Partial<Task> & { title: string },
): boolean {
  const lines = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n').split('\n')
    .map((l) => l.replace(LINE_MARK_RE, '').trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  e.preventDefault();
  const input = e.currentTarget;
  const before = input.value.slice(0, input.selectionStart ?? input.value.length).trim();
  const after = input.value.slice(input.selectionEnd ?? input.value.length).trim();
  lines[0] = `${before} ${lines[0]}`.trim();
  lines[lines.length - 1] = `${lines[lines.length - 1]} ${after}`.trim();

  const now = Date.now();
  const ids = lines.slice(0, 200).map((line, i) => addTask({ ...make(parseQuickAdd(line, projects)), position: now + i }).id);
  toast(`أُضيفت ${tasksLabel(ids.length)}`, { label: 'تراجع', run: () => deleteTasks(ids, { silent: true }) });
  return true;
}

/** Inline "+ أضف مهمة" row that expands into a smart input. */
export function InlineAdd({ defaults = {}, label = 'أضف مهمة', autoOpen = false }: {
  defaults?: QuickAddDefaults; label?: string; autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [text, setText] = useState('');
  const projects = useProjectList();
  const parsed = useMemo(() => parseQuickAdd(text, projects), [text, projects]);

  const submit = () => {
    if (!text.trim()) return;
    addTask(build(parsed, defaults));
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

  if (!open) {
    return (
      <button className="inline-add" onClick={() => setOpen(true)}>
        <span className="plus"><Plus /></span>
        {label}
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
        onPaste={(e) => { if (pasteAsTasks(e, projects, (p) => build(p, defaults))) setText(''); }}
        onBlur={() => !text.trim() && setOpen(false)}
        placeholder="مثال: تسليم التقرير بكرا الساعة 10 !!"
        enterKeyHint="done"
      />
      <ParsedChips parsed={parsed} />
      <div className="row-end">
        <button className="btn btn-ghost btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { setText(''); setOpen(false); }}>إلغاء</button>
        <button className="btn btn-primary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={!text.trim()}>إضافة</button>
      </div>
    </div>
  );
}

/** Global quick-add dialog (FAB, "q" shortcut, command palette). */
export function QuickAddModal() {
  const defaults = useStore((s) => s.quickAdd);
  if (!defaults) return null;
  return <QuickAddDialog defaults={defaults} />;
}

function QuickAddDialog({ defaults }: { defaults: QuickAddDefaults }) {
  const [text, setText] = useState(defaults.text ?? '');
  const [manual, setManual] = useState<{ projectId?: string | null; dueDate?: string | null; priority?: Priority }>({});
  const projects = useProjectList();
  const parsed = useMemo(() => parseQuickAdd(text, projects), [text, projects]);
  const projectPop = usePopover();
  const datePop = usePopover();
  const inputRef = useRef<HTMLInputElement>(null);

  const effective = { ...defaults, ...('projectId' in manual ? { projectId: manual.projectId } : {}), ...('dueDate' in manual ? { dueDate: manual.dueDate } : {}) };
  const projectId = parsed.projectId ?? effective.projectId ?? null;
  const dueDate = parsed.dueDate ?? effective.dueDate ?? null;
  const priority = parsed.priority ?? manual.priority ?? 0;
  const project = projects.find((p) => p.id === projectId);

  const submit = () => {
    if (!text.trim()) return;
    const task = addTask(build(parsed, effective, { priority }));
    closeQuickAdd();
    toast('أُضيفت المهمة', { label: 'فتح', run: () => selectTask(task.id) });
  };

  return (
    <Modal open onClose={closeQuickAdd} width={560} className="quick-add">
      <CaptureModeSwitch mode="task" onChange={() => openIdeaCapture({ text })} />
      <input
        ref={inputRef}
        className="qa-input"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={(e) => {
          if (pasteAsTasks(e, projects, (p) => build(p, effective, { priority: p.priority ?? manual.priority ?? 0 }))) closeQuickAdd();
        }}
        placeholder="شو بدك تنجز؟"
        enterKeyHint="done"
      />
      <ParsedChips parsed={parsed} />
      <p className="qa-hint">
        اكتب بشكل طبيعي: <b>بكرا</b>، <b>الخميس الساعة 5</b>، <b>كل يوم</b>، <b>#وسم</b>، <b>@مشروع</b>، <b>!!!</b> للأولوية
      </p>
      <div className="qa-bar">
        <button className={clsx('qa-pill', project && 'set')} onClick={projectPop.toggle}>
          {project ? <i className="project-dot" style={{ '--c': project.color } as React.CSSProperties} /> : <Inbox />}
          {project?.name ?? 'الوارد'}
        </button>
        <button className={clsx('qa-pill', dueDate && 'set')} onClick={datePop.toggle}>
          <CalendarDays />
          {dueDate ? relativeDay(dueDate) : 'التاريخ'}
        </button>
        <div className="prio-row inline">
          {([3, 2, 1] as Priority[]).map((p) => (
            <button
              key={p}
              className={clsx('prio-btn', `p${p}`, priority === p && 'on')}
              title={['', 'منخفضة', 'متوسطة', 'عالية'][p]}
              onClick={() => setManual((m) => ({ ...m, priority: m.priority === p ? 0 : p }))}
            >
              <Flag />
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn btn-accent" onClick={submit} disabled={!text.trim()}>إضافة</button>
      </div>

      {projectPop.open && (
        <Popover anchor={projectPop.anchor} onClose={projectPop.close} width={240}>
          <MenuItem icon={<Inbox />} label="الوارد" active={!projectId} onClick={() => { setManual((m) => ({ ...m, projectId: null })); projectPop.close(); inputRef.current?.focus(); }} />
          {projects.map((p) => (
            <MenuItem
              key={p.id}
              icon={<i className="project-dot" style={{ '--c': p.color } as React.CSSProperties} />}
              label={p.name}
              active={projectId === p.id}
              onClick={() => { setManual((m) => ({ ...m, projectId: p.id })); projectPop.close(); inputRef.current?.focus(); }}
            />
          ))}
        </Popover>
      )}
      {datePop.open && (
        <Popover anchor={datePop.anchor} onClose={datePop.close} width={264}>
          <DatePicker value={dueDate} onPick={(d) => { setManual((m) => ({ ...m, dueDate: d })); datePop.close(); inputRef.current?.focus(); }} />
        </Popover>
      )}
    </Modal>
  );
}
