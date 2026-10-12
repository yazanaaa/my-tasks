import { useEffect, useState } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import {
  Archive, ArchiveRestore, CloudOff, FolderKanban, ListTodo, Pin, PinOff, Trash2, Undo2, X,
} from 'lucide-react';
import clsx from 'clsx';
import {
  archiveIdea, deleteIdeas, ideaToProject, ideaToTask, selectIdea, selectTask, unconvertIdea, updateIdea, useStore,
} from '../store';
import { timeAgo } from '../lib/dates';
import { cleanIdeaText, IDEA_COLORS, IDEA_MAX } from '../lib/ideas';
import type { Idea } from '../types';
import { AutoTextarea, Modal } from './ui';

const PENDING = 'محفوظة على جهازك، رح تنرفع لما يرجع النت';

type Go = (to: string) => void;

export function IdeaSheetHost() {
  const id = useStore((s) => s.selectedIdeaId);
  const idea = useStore((s) => (id ? s.ideas[id] : undefined));
  const inRouter = useInRouterContext();
  if (!idea) return null;
  return inRouter
    ? <RoutedIdeaSheet key={idea.id} idea={idea} />
    : <IdeaSheet key={idea.id} idea={idea} go={(to) => window.location.assign(to)} />;
}

function RoutedIdeaSheet({ idea }: { idea: Idea }) {
  const navigate = useNavigate();
  return <IdeaSheet idea={idea} go={(to) => navigate(to)} />;
}

function IdeaSheet({ idea, go }: { idea: Idea; go: Go }) {
  const [text, setText] = useState(idea.text);
  const pending = useStore((s) => !!s.pendingIdeas[idea.id]);
  const task = useStore((s) => (idea.taskId ? s.tasks[idea.taskId] : undefined));
  const project = useStore((s) => (idea.projectId ? s.projects[idea.projectId] : undefined));
  const converted = idea.convertedAt != null;

  useEffect(() => setText(idea.text), [idea.text]);

  // On blur, and before anything that closes the sheet. Emptying the text reverts it.
  const saveText = () => {
    const current = useStore.getState().ideas[idea.id];
    if (!current) return;
    const clean = cleanIdeaText(text);
    if (!clean) setText(current.text);
    else if (clean !== current.text) updateIdea(idea.id, { text: clean });
  };

  const close = () => {
    saveText();
    selectIdea(null);
  };

  const toProject = () => {
    saveText();
    const p = ideaToProject(idea.id);
    if (p) go(`/projects/${p.id}`);
  };

  return (
    <Modal open onClose={close} width={540} className="idea-sheet">
      <div className="idea-sheet-body" style={{ '--c': idea.color } as React.CSSProperties}>
        <div className="idea-sheet-head">
          <span>انكتبت {timeAgo(idea.createdAt)}</span>
          {pending && (
            <span className="idea-sheet-pending" role="img" aria-label={PENDING} title={PENDING}>
              <CloudOff className="idea-pending" />
            </span>
          )}
          <span className="spacer" />
          <button
            type="button"
            className={clsx('icon-btn', idea.pinned && 'on')}
            aria-label={idea.pinned ? 'فك التثبيت' : 'ثبّت'}
            title={idea.pinned ? 'فك التثبيت' : 'ثبّت'}
            onClick={() => updateIdea(idea.id, { pinned: !idea.pinned })}
          >
            {idea.pinned ? <PinOff /> : <Pin />}
          </button>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={close}><X /></button>
        </div>

        <AutoTextarea
          className="idea-sheet-text"
          dir="auto"
          maxLength={IDEA_MAX}
          placeholder="اكتب الفكرة…"
          aria-label="الفكرة"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveText}
        />

        <div className="swatches" role="group" aria-label="لون الفكرة">
          {IDEA_COLORS.map((c) => (
            <button
              key={c.hue}
              type="button"
              className="swatch"
              style={{ background: c.hue }}
              aria-pressed={idea.color.toLowerCase() === c.hue.toLowerCase()}
              aria-label={c.name}
              title={c.name}
              onClick={() => updateIdea(idea.id, { color: c.hue })}
            />
          ))}
        </div>

        {converted && (
          <div className="idea-sheet-converted">
            {task ? (
              <button
                type="button"
                className="parent-link idea-sheet-link"
                onClick={() => {
                  saveText();
                  selectIdea(null);
                  selectTask(task.id);
                }}
              >
                <ListTodo /><span>صارت مهمة: {task.title}</span>
              </button>
            ) : project ? (
              <button
                type="button"
                className="parent-link idea-sheet-link"
                onClick={() => {
                  saveText();
                  selectIdea(null);
                  go(`/projects/${project.id}`);
                }}
              >
                <FolderKanban /><span>صارت مشروع: {project.name}</span>
              </button>
            ) : (
              <span className="idea-sheet-dangling">تحوّلت لشغل، بس انحذف</span>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => unconvertIdea(idea.id)}>
              <Undo2 />رجّعها للأفكار
            </button>
          </div>
        )}

        <div className="idea-sheet-actions">
          {!converted && !idea.archived && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  saveText();
                  ideaToTask(idea.id);
                }}
              >
                <ListTodo />حوّلها لمهمة
              </button>
              <button type="button" className="btn btn-soft" onClick={toProject}><FolderKanban />حوّلها لمشروع</button>
            </>
          )}
          <span className="spacer" />
          {idea.archived ? (
            <button type="button" className="btn btn-soft idea-restore" onClick={() => archiveIdea(idea.id, false)}>
              <ArchiveRestore />استرجاع
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn"
              aria-label="أرشفة"
              title="أرشفة"
              onClick={() => {
                saveText();
                archiveIdea(idea.id);
                selectIdea(null);
              }}
            >
              <Archive />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="حذف"
            title="حذف"
            onClick={() => {
              saveText(); // so undo brings back the edited text
              deleteIdeas([idea.id]);
              selectIdea(null);
            }}
          >
            <Trash2 />
          </button>
        </div>
      </div>
    </Modal>
  );
}
