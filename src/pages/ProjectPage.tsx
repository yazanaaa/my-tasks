import { useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, ArrowRight, Columns3, LayoutList, MoreHorizontal, Pencil, Plus, Trash2,
} from 'lucide-react';
import {
  addSection, deleteProject, deleteSection, reorderSections, updateProject, updateSection, useStore,
} from '../store';
import { byCompletedDesc, byPinned, useSectionsOf, useSubtaskCounts, useTaskList } from '../lib/selectors';
import { Icon } from '../components/Icon';
import { openProjectForm } from '../components/Forms';
import { PageTitle, ProgressPie } from '../components/PageTitle';
import { InlineAdd } from '../components/QuickAdd';
import { SortableGroup, SortableGroups, SortableItem, useDragActive, useGroupIds } from '../components/SortableGroups';
import { commitMove, CompletedSection, OverlayRow, SortableTaskRows } from '../components/TaskLists';
import { TaskRow } from '../components/TaskRow';
import { confirmDialog, MenuItem, Popover, usePopover } from '../components/ui';
import type { Project, Section } from '../types';

export function ProjectPage() {
  const { id = '' } = useParams();
  const project = useStore((s) => s.projects[id]);
  if (!project) return <Navigate to="/projects" replace />;
  return <ProjectView key={project.id} project={project} />;
}

function ProjectView({ project }: { project: Project }) {
  const navigate = useNavigate();
  const sections = useSectionsOf(project.id);
  const tasks = useTaskList();
  const menu = usePopover();
  const none = `none:${project.id}`;

  const { groups, done, total } = useMemo(() => {
    const mine = tasks.filter((t) => t.projectId === project.id && !t.parentId);
    const open = mine.filter((t) => !t.completed).sort(byPinned);
    const valid = new Set(sections.map((s) => s.id));
    const g: Record<string, string[]> = { [none]: [] };
    for (const s of sections) g[s.id] = [];
    for (const t of open) g[t.sectionId && valid.has(t.sectionId) ? t.sectionId : none].push(t.id);
    return { groups: g, done: mine.filter((t) => t.completed).sort(byCompletedDesc), total: mine.length };
  }, [tasks, sections, project.id, none]);

  const pct = total ? Math.round((done.length / total) * 100) : 0;
  const onMove = (m: { id: string; groupId: string; ids: string[] }) =>
    commitMove(m, { sectionId: m.groupId === none ? null : m.groupId });

  const remove = async () => {
    menu.close();
    const ok = await confirmDialog({
      title: `حذف «${project.name}»؟`,
      message: `رح تنحذف كل مهام المشروع (${total}) نهائيًا. إذا بدك تحتفظ فيها، أرشف المشروع بدل ما تحذفه.`,
      confirmLabel: 'حذف المشروع',
    });
    if (ok) {
      navigate('/projects');
      deleteProject(project.id);
    }
  };

  return (
    <div className={project.view === 'board' ? 'page wide' : 'page'}>
      <div className="project-head" style={{ '--c': project.color } as React.CSSProperties}>
        <PageTitle
          icon={<ProgressPie value={total ? done.length / total : 0} color={project.color} size={28} />}
          title={project.name}
          subtitle={<>
            <span className="row" style={{ gap: 6 }}>
              <span className="project-icon xs"><Icon name={project.icon} /></span>
              {project.archived ? 'مشروع مؤرشف' : <span className="num">{pct}% مكتمل · {done.length} من {total}</span>}
            </span>
            {project.description && <p>{project.description}</p>}
          </>}
          actions={<>
            <div className="segmented">
              <button aria-pressed={project.view === 'list'} onClick={() => updateProject(project.id, { view: 'list' })}><LayoutList />قائمة</button>
              <button aria-pressed={project.view === 'board'} onClick={() => updateProject(project.id, { view: 'board' })}><Columns3 />لوحة</button>
            </div>
            <button className="icon-btn" aria-label="خيارات المشروع" onClick={menu.toggle}><MoreHorizontal /></button>
          </>}
        />
      </div>

      {menu.open && (
        <Popover anchor={menu.anchor} onClose={menu.close} width={220}>
          <MenuItem icon={<Pencil />} label="تعديل المشروع" onClick={() => { menu.close(); openProjectForm(project); }} />
          <MenuItem icon={<Plus />} label="قسم جديد" onClick={() => { menu.close(); addSection(project.id, 'قسم جديد'); }} />
          {project.archived
            ? <MenuItem icon={<ArchiveRestore />} label="إلغاء الأرشفة" onClick={() => { menu.close(); updateProject(project.id, { archived: false }); }} />
            : <MenuItem icon={<Archive />} label="أرشفة" onClick={() => { menu.close(); updateProject(project.id, { archived: true }); }} />}
          <div className="menu-sep" />
          <MenuItem icon={<Trash2 />} label="حذف المشروع" danger onClick={remove} />
        </Popover>
      )}

      <SortableGroups groups={groups} onMove={onMove} renderOverlay={(id) => <OverlayRow id={id} showProject={false} />}>
        {project.view === 'board'
          ? <Board project={project} sections={sections} none={none} />
          : <ListView project={project} sections={sections} none={none} />}
      </SortableGroups>

      <CompletedSection tasks={done} showProject={false} />
    </div>
  );
}

function ListView({ project, sections, none }: { project: Project; sections: Section[]; none: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  return (
    <>
      <SortableGroup id={none} className="group-drop">
        <SortableTaskRows groupId={none} showProject={false} />
      </SortableGroup>
      <InlineAdd defaults={{ projectId: project.id }} />

      {sections.map((s, i) => (
        <section key={s.id} className="group">
          <SectionHeader section={s} sections={sections} index={i} />
          <SortableGroup id={s.id} className="group-drop">
            <SortableTaskRows groupId={s.id} showProject={false} />
          </SortableGroup>
          <InlineAdd defaults={{ projectId: project.id, sectionId: s.id }} />
        </section>
      ))}

      {adding ? (
        <form
          className="section-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) addSection(project.id, name.trim());
            setName('');
            setAdding(false);
          }}
        >
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم القسم" onBlur={() => !name.trim() && setAdding(false)} />
          <button className="btn btn-primary" type="submit">إضافة</button>
        </form>
      ) : (
        <button className="add-section-btn" onClick={() => setAdding(true)}><Plus />قسم جديد</button>
      )}
    </>
  );
}

function SectionHeader({ section, sections, index }: { section: Section; sections: Section[]; index: number }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const ids = useGroupIds(section.id);
  const menu = usePopover();

  const move = (dir: -1 | 1) => {
    const order = [...sections];
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    reorderSections(order.map((s, i) => ({ id: s.id, position: (i + 1) * 1024 })));
  };
  const save = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== section.name) updateSection(section.id, { name: name.trim() });
    else setName(section.name);
  };
  const remove = async () => {
    menu.close();
    if (await confirmDialog({ title: `حذف قسم «${section.name}»؟`, message: 'المهام اللي فيه رح تضل بالمشروع بدون قسم.', confirmLabel: 'حذف القسم' })) {
      deleteSection(section.id);
    }
  };

  return (
    <div className="group-head">
      {editing ? (
        <input
          className="section-name-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(section.name); setEditing(false); } }}
        />
      ) : (
        <h2 className="h2" onDoubleClick={() => setEditing(true)}>{section.name}</h2>
      )}
      <span className="count num">{ids.length}</span>
      <div className="actions">
        <button className="icon-btn sm" aria-label="خيارات القسم" onClick={menu.toggle}><MoreHorizontal /></button>
      </div>
      {menu.open && (
        <Popover anchor={menu.anchor} onClose={menu.close} width={200}>
          <MenuItem icon={<Pencil />} label="إعادة تسمية" onClick={() => { menu.close(); setEditing(true); }} />
          {index > 0 && <MenuItem icon={<ArrowRight />} label="تقديم" onClick={() => { menu.close(); move(-1); }} />}
          {index < sections.length - 1 && <MenuItem icon={<ArrowLeft />} label="تأخير" onClick={() => { menu.close(); move(1); }} />}
          <div className="menu-sep" />
          <MenuItem icon={<Trash2 />} label="حذف القسم" danger onClick={remove} />
        </Popover>
      )}
    </div>
  );
}

function Board({ project, sections, none }: { project: Project; sections: Section[]; none: string }) {
  const noneIds = useGroupIds(none);
  const dragging = useDragActive();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  // Keep the "no section" column mounted for the whole drag, even once it empties,
  // so the other columns don't shift under the pointer.
  const noneShown = useRef(false);
  if (!dragging) noneShown.current = noneIds.length > 0 || sections.length === 0;
  return (
    <div className="board">
      {(noneShown.current || noneIds.length > 0) && (
        <div className="board-col">
          <div className="board-col-head"><h2 className="h2">{sections.length ? 'بدون قسم' : 'المهام'}</h2><span className="count num">{noneIds.length}</span></div>
          <SortableGroup id={none} className="board-drop">
            <BoardCards groupId={none} />
          </SortableGroup>
          <InlineAdd defaults={{ projectId: project.id }} label="بطاقة جديدة" />
        </div>
      )}
      {sections.map((s, i) => (
        <div key={s.id} className="board-col">
          <div className="board-col-head-wrap"><SectionHeader section={s} sections={sections} index={i} /></div>
          <SortableGroup id={s.id} className="board-drop">
            <BoardCards groupId={s.id} />
          </SortableGroup>
          <InlineAdd defaults={{ projectId: project.id, sectionId: s.id }} label="بطاقة جديدة" />
        </div>
      ))}
      <div className="board-col add">
        {adding ? (
          <form
            className="stack"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) addSection(project.id, name.trim());
              setName('');
              setAdding(false);
            }}
          >
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العمود" onBlur={() => !name.trim() && setAdding(false)} />
            <button className="btn btn-primary btn-sm" type="submit">إضافة عمود</button>
          </form>
        ) : (
          <button className="add-section-btn" onClick={() => setAdding(true)}><Plus />عمود جديد</button>
        )}
      </div>
    </div>
  );
}

function BoardCards({ groupId }: { groupId: string }) {
  const ids = useGroupIds(groupId);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useSubtaskCounts();
  return (
    <>
      {ids.map((id) => tasks[id] && (
        <SortableItem key={id} id={id}>
          {({ dragging }) => (
            <div className="board-card">
              <TaskRow task={tasks[id]} showProject={false} subtasks={subtasks[id]} dragging={dragging} compact />
            </div>
          )}
        </SortableItem>
      ))}
    </>
  );
}
