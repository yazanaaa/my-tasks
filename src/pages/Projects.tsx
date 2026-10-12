import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, FolderPlus, Plus } from 'lucide-react';
import { useProjectList, useTaskList } from '../lib/selectors';
import { relativeDay, todayKey } from '../lib/dates';
import { Icon } from '../components/Icon';
import { openProjectForm } from '../components/Forms';
import { EmptyState } from '../components/ui';
import type { Project } from '../types';
import { PageTitle } from '../components/PageTitle';

export function ProjectsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const projects = useProjectList(true);
  const tasks = useTaskList();
  const today = todayKey();

  const stats = useMemo(() => {
    const out: Record<string, { open: number; done: number; overdue: number; next?: string }> = {};
    for (const t of tasks) {
      if (!t.projectId || t.parentId) continue;
      const s = (out[t.projectId] ??= { open: 0, done: 0, overdue: 0 });
      if (t.completed) s.done += 1;
      else {
        s.open += 1;
        if (t.dueDate && t.dueDate < today) s.overdue += 1;
        if (t.dueDate && t.dueDate >= today && (!s.next || t.dueDate < s.next)) s.next = t.dueDate;
      }
    }
    return out;
  }, [tasks, today]);

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div className="page wide">
      <PageTitle
        view="projects"
        title="المشاريع"
        subtitle={active.length ? `${active.length} مشروع نشط` : undefined}
        actions={<button className="btn btn-primary" onClick={() => openProjectForm()}><Plus />مشروع جديد</button>}
      />

      {active.length === 0 ? (
        <EmptyState
          color="var(--hue-indigo)"
          icon={<FolderPlus />}
          title="ابدأ أول مشروع"
          body="المشروع يجمع المهام المرتبطة بهدف واحد، وتقدر تعرضه كقائمة أو كلوحة مراحل."
          action={<button className="btn btn-primary" onClick={() => openProjectForm()}>مشروع جديد</button>}
        />
      ) : (
        <div className="project-grid">
          {active.map((p) => <ProjectCard key={p.id} project={p} stats={stats[p.id]} />)}
          <button className="project-card new" onClick={() => openProjectForm()}>
            <Plus />
            <span>مشروع جديد</span>
          </button>
        </div>
      )}

      {archived.length > 0 && (
        <>
          <button className="collapse-btn" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
            <Archive />المؤرشفة <span className="num">({archived.length})</span>
          </button>
          {showArchived && (
            <div className="project-grid">
              {archived.map((p) => <ProjectCard key={p.id} project={p} stats={stats[p.id]} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProjectCard({ project, stats }: { project: Project; stats?: { open: number; done: number; overdue: number; next?: string } }) {
  const total = (stats?.open ?? 0) + (stats?.done ?? 0);
  const pct = total ? Math.round(((stats?.done ?? 0) / total) * 100) : 0;
  return (
    <Link to={`/projects/${project.id}`} className="project-card" style={{ '--c': project.color } as React.CSSProperties}>
      <div className="project-card-top">
        <span className="project-icon"><Icon name={project.icon} /></span>
        <span className="project-pct num">{pct}%</span>
      </div>
      <h3 className="h2">{project.name}</h3>
      {project.description && <p className="project-desc">{project.description}</p>}
      <div className="project-bar"><i style={{ width: `${pct}%` }} /></div>
      <div className="project-foot">
        <span className="num">{stats?.done ?? 0}/{total} مهمة</span>
        {stats?.overdue ? <span className="accent">{stats.overdue} متأخرة</span>
          : stats?.next ? <span>التالي: {relativeDay(stats.next)}</span> : null}
      </div>
    </Link>
  );
}
