import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Columns3, LayoutList } from 'lucide-react';
import { create } from 'zustand';
import { addHabit, addProject, addSection, updateHabit, updateProject } from '../store';
import { DAY_SHORT } from '../lib/dates';
import { HABIT_ICONS, PROJECT_COLORS, PROJECT_ICONS } from '../lib/theme';
import type { Habit, Project } from '../types';
import { Icon } from './Icon';
import { Modal } from './ui';

interface FormsState {
  project: Project | 'new' | null;
  habit: Habit | 'new' | null;
}
const useForms = create<FormsState>(() => ({ project: null, habit: null }));

export const openProjectForm = (project: Project | 'new' = 'new') => useForms.setState({ project });
export const openHabitForm = (habit: Habit | 'new' = 'new') => useForms.setState({ habit });

export function FormsHost() {
  const { project, habit } = useForms();
  return (
    <>
      {project && <ProjectForm key={project === 'new' ? 'new' : project.id} project={project === 'new' ? null : project} />}
      {habit && <HabitForm key={habit === 'new' ? 'new' : habit.id} habit={habit === 'new' ? null : habit} />}
    </>
  );
}

const DEFAULT_SECTIONS = ['للتنفيذ', 'قيد العمل', 'تم'];

function ProjectForm({ project }: { project: Project | null }) {
  const navigate = useNavigate();
  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [icon, setIcon] = useState(project?.icon ?? 'folder');
  const [view, setView] = useState<Project['view']>(project?.view ?? 'list');
  const [description, setDescription] = useState(project?.description ?? '');
  const close = () => useForms.setState({ project: null });

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (project) {
      updateProject(project.id, { name: n, color, icon, view, description });
    } else {
      const p = addProject({ name: n, color, icon, view, description });
      if (view === 'board') DEFAULT_SECTIONS.forEach((s, i) => addSection(p.id, s, Date.now() + i));
      navigate(`/projects/${p.id}`);
    }
    close();
  };

  return (
    <Modal
      open
      onClose={close}
      title={project ? 'تعديل المشروع' : 'مشروع جديد'}
      footer={<>
        <button className="btn btn-ghost" onClick={close}>إلغاء</button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>{project ? 'حفظ' : 'إنشاء المشروع'}</button>
      </>}
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          <span>الاسم</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: إطلاق الموقع" maxLength={120} />
        </label>
        <label className="field">
          <span>الوصف</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="اختياري: هدف المشروع بجملة" />
        </label>
        <div className="field">
          <span>اللون</span>
          <div className="swatches">
            {PROJECT_COLORS.map((c) => (
              <button type="button" key={c} className="swatch" style={{ background: c }} aria-pressed={color === c} aria-label={c} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div className="field">
          <span>الأيقونة</span>
          <div className="icon-grid">
            {PROJECT_ICONS.map((i) => (
              <button type="button" key={i} aria-pressed={icon === i} onClick={() => setIcon(i)} style={icon === i ? { color } : undefined}>
                <Icon name={i} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>طريقة العرض</span>
          <div className="segmented" style={{ justifySelf: 'start' }}>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><LayoutList />قائمة</button>
            <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}><Columns3 />لوحة</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function HabitForm({ habit }: { habit: Habit | null }) {
  const [name, setName] = useState(habit?.name ?? '');
  const [color, setColor] = useState(habit?.color ?? PROJECT_COLORS[0]);
  const [icon, setIcon] = useState(habit?.icon ?? 'flame');
  const [days, setDays] = useState<number[]>(habit?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const close = () => useForms.setState({ habit: null });

  const save = () => {
    const n = name.trim();
    if (!n || !days.length) return;
    if (habit) updateHabit(habit.id, { name: n, color, icon, days });
    else addHabit({ name: n, color, icon, days });
    close();
  };
  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));

  return (
    <Modal
      open
      onClose={close}
      title={habit ? 'تعديل العادة' : 'عادة جديدة'}
      footer={<>
        <button className="btn btn-ghost" onClick={close}>إلغاء</button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim() || !days.length}>{habit ? 'حفظ' : 'إضافة العادة'}</button>
      </>}
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          <span>العادة</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: قراءة 20 صفحة" maxLength={120} />
        </label>
        <div className="field">
          <span>الأيام</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <button type="button" key={d} className="day-toggle" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)}>{DAY_SHORT[d]}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 12, fontSize: 13 }}>
            <button type="button" className="link" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>كل يوم</button>
            <button type="button" className="link" onClick={() => setDays([0, 1, 2, 3, 4])}>أيام العمل</button>
          </div>
        </div>
        <div className="field">
          <span>اللون</span>
          <div className="swatches">
            {PROJECT_COLORS.map((c) => (
              <button type="button" key={c} className="swatch" style={{ background: c }} aria-pressed={color === c} aria-label={c} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div className="field">
          <span>الأيقونة</span>
          <div className="icon-grid">
            {HABIT_ICONS.map((i) => (
              <button type="button" key={i} aria-pressed={icon === i} onClick={() => setIcon(i)} style={icon === i ? { color } : undefined}>
                <Icon name={i} />
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
