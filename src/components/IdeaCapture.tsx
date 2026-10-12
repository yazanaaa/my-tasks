import { useEffect, useMemo, useRef, useState } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { ArrowUp, CircleCheck, Lightbulb, X } from 'lucide-react';
import {
  addIdea, closeIdeaCapture, deleteIdeas, openIdeaCapture, openQuickAdd, toast, useStore, type IdeaCaptureState,
} from '../store';
import { ideasLabel } from '../lib/dates';
import { cleanIdeaText, IDEA_MAX, pickIdeaColor, splitIdea } from '../lib/ideas';
import { clearDraft, readDraft, writeDraft } from '../lib/outbox';
import type { Idea, IdeaSource } from '../types';
import { AutoTextarea, Modal } from './ui';

const PLACEHOLDERS = [
  'شو الفكرة اللي ببالك؟',
  'اكتبها قبل ما تطير…',
  'نص فكرة؟ اكتبها، بتكمّلها بعدين',
  'ولا فكرة غريبة، هون مكانها',
];

type Go = (to: string) => void;

const onIdeasPage = () => window.location.pathname.replace(/\/+$/, '') === '/ideas';

/** «فكرة | مهمة» switch shared by the capture sheet and task quick-add. */
export function CaptureModeSwitch({ mode, onChange, pulseKey }: {
  mode: 'idea' | 'task'; onChange: (mode: 'idea' | 'task') => void; pulseKey?: number;
}) {
  return (
    <div className="segmented capture-mode" role="group" aria-label="نوع الإضافة">
      <button
        type="button"
        aria-pressed={mode === 'idea'}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => mode !== 'idea' && onChange('idea')}
      >
        <Lightbulb key={pulseKey} className={pulseKey ? 'pulse' : undefined} />فكرة
      </button>
      <button
        type="button"
        aria-pressed={mode === 'task'}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => mode !== 'task' && onChange('task')}
      >
        <CircleCheck />مهمة
      </button>
    </div>
  );
}

/** Always mounted, so the sheet opens instantly from anywhere, the offline screen included. */
export function IdeaCaptureHost() {
  const capture = useStore((s) => s.ideaCapture);
  const inRouter = useInRouterContext();
  if (!capture) return null;
  // Without a router (offline screen) the only navigation left is a plain page load.
  return inRouter
    ? <RoutedCaptureDialog key={capture.key} capture={capture} />
    : <IdeaCaptureDialog key={capture.key} capture={capture} go={(to) => window.location.assign(to)} />;
}

function RoutedCaptureDialog({ capture }: { capture: IdeaCaptureState }) {
  const navigate = useNavigate();
  return <IdeaCaptureDialog capture={capture} go={(to) => navigate(to)} />;
}

function IdeaCaptureDialog({ capture, go }: { capture: IdeaCaptureState; go: Go }) {
  const [initialText] = useState(() => capture.text || readDraft('capture')?.text || '');
  const [text, setText] = useState(initialText);
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const ideas = useStore((s) => s.ideas);
  // Refs, because a native beforeinput can fire before React re-renders with the cleared text.
  const textRef = useRef(initialText);
  const sourceRef = useRef<IdeaSource>(capture.source);
  const shiftRef = useRef(false);
  const doneRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useKeyboardInset();

  const ideaList = useMemo(() => Object.values(ideas), [ideas]);
  const nextColor = pickIdeaColor(text, ideaList);
  // Live from the store, newest first: an idea deleted from its chip drops out of the count too.
  const session = savedIds.map((id) => ideas[id]).filter((i): i is Idea => !!i).reverse();

  const edit = (value: string) => {
    textRef.current = value;
    setText(value);
    writeDraft('capture', value);
  };

  const save = (): Idea | null => {
    const idea = addIdea({ id: readDraft('capture')?.id, text: textRef.current, source: sourceRef.current });
    if (!idea) return null;
    clearDraft('capture');
    textRef.current = '';
    setText('');
    setSavedIds((ids) => (ids.includes(idea.id) ? ids : [...ids, idea.id]));
    sourceRef.current = 'app'; // only the first save keeps share/link
    navigator.vibrate?.(8);
    return idea;
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const commitAndClose = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const value = textRef.current;
    const dirty = value.trim() !== initialText.trim();
    // Only text a link or share actually brought: an empty share that fell back to the draft is the user's own.
    const prefilled = !!capture.text && (sourceRef.current === 'link' || sourceRef.current === 'share');
    let pending = false;
    if (cleanIdeaText(value) && (dirty || !prefilled)) {
      const idea = save();
      if (idea) {
        toast('انحفظت الفكرة', {
          label: 'تراجع',
          run: () => {
            deleteIdeas([idea.id], { silent: true });
            openIdeaCapture({ text: idea.text });
          },
        });
      } else {
        // No account to save into yet: keep it as a draft, recovered on the next start.
        writeDraft('capture', value);
        pending = true;
      }
    } else if (session.length && useStore.getState().status === 'ready' && !onIdeasPage()) {
      toast(`انحفظت ${ideasLabel(session.length)}`, { label: 'عرض', run: () => go('/ideas') });
    }
    if (!pending) clearDraft('capture');
    closeIdeaCapture();
  };

  const toTask = () => {
    doneRef.current = true;
    clearDraft('capture');
    openQuickAdd({ text: textRef.current });
  };

  const focusInput = () => rowRef.current?.querySelector('textarea')?.focus();

  // This sheet replaced one that still had typed text (e.g. an old toast's «تراجع» while typing):
  // that text is in the draft, and the prefilled text here would take over its id. Keep it as its own idea.
  useEffect(() => {
    const orphan = readDraft('capture');
    if (!capture.text.trim() || !orphan?.text.trim() || orphan.text.trim() === capture.text.trim()) return;
    const idea = addIdea({ id: orphan.id, text: orphan.text, source: 'draft' });
    if (!idea) return;
    clearDraft('capture');
    setSavedIds((ids) => (ids.includes(idea.id) ? ids : [idea.id, ...ids]));
  }, [capture]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    // Prefilled text: start typing at its end.
    const input = row.querySelector('textarea');
    if (input?.value) input.setSelectionRange(input.value.length, input.value.length);
    // Android keyboards report Return as keyCode 229 on keydown; their beforeinput still says what it does.
    const onBeforeInput = (e: Event) => {
      const { inputType } = e as InputEvent;
      if ((inputType === 'insertParagraph' || inputType === 'insertLineBreak') && !shiftRef.current) {
        e.preventDefault();
        saveRef.current();
      }
    };
    row.addEventListener('beforeinput', onBeforeInput);
    return () => row.removeEventListener('beforeinput', onBeforeInput);
  }, []);

  return (
    <Modal open onClose={commitAndClose} width={560} className="idea-capture">
      <div className="capture-body" style={{ '--c': nextColor } as React.CSSProperties}>
        <div className="capture-head">
          <CaptureModeSwitch mode="idea" pulseKey={savedIds.length} onChange={toTask} />
          {session.length > 0 && <span className="capture-count">انحفظت {ideasLabel(session.length)} هالقعدة</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={commitAndClose}>تم</button>
        </div>
        <div className="capture-row" ref={rowRef}>
          <AutoTextarea
            className="capture-input"
            autoFocus
            dir="auto"
            enterKeyHint="send"
            maxLength={IDEA_MAX}
            placeholder={placeholder}
            aria-label="الفكرة"
            value={text}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={(e) => {
              shiftRef.current = e.shiftKey;
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                save();
              }
            }}
            onKeyUp={(e) => { shiftRef.current = e.shiftKey; }}
          />
          <button
            type="button"
            className="idea-send"
            aria-label="احفظ الفكرة"
            disabled={!text.trim()}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              save();
              focusInput();
            }}
          >
            <ArrowUp />
          </button>
        </div>
        <p className="capture-hint">Enter للحفظ · Shift+Enter لسطر جديد · #وسم للتصنيف</p>
        {session.length > 0 && (
          <div className="capture-stack">
            {session.slice(0, 3).map((idea) => (
              <div key={idea.id} className="capture-chip" style={{ '--c': idea.color } as React.CSSProperties}>
                <span dir="auto">{splitIdea(idea.text).title}</span>
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label="احذف الفكرة"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => deleteIdeas([idea.id])}
                >
                  <X />
                </button>
              </div>
            ))}
            {session.length > 3 && <span className="capture-more">+{session.length - 3}</span>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Phones: how much of the layout viewport the on-screen keyboard covers, as `--kb` (lifts the sheet). */
function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--kb', `${Math.round(kb)}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--kb');
    };
  }, []);
}
