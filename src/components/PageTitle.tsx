import type { ReactNode } from 'react';
import {
  CalendarDays, CalendarRange, ChartColumn, Flame, FolderKanban, Inbox, Lightbulb, Settings, Star, type LucideIcon,
} from 'lucide-react';

// Each view owns a color: it tints its sidebar icon and its page title icon.
export const VIEWS = {
  today: { label: 'اليوم', icon: Star, color: '#EFAA14', to: '/' },
  upcoming: { label: 'القادم', icon: CalendarDays, color: '#E0484F', to: '/upcoming' },
  inbox: { label: 'الوارد', icon: Inbox, color: '#2F6FB3', to: '/inbox' },
  ideas: { label: 'الأفكار', icon: Lightbulb, color: '#EC4C9A', to: '/ideas' },
  calendar: { label: 'التقويم', icon: CalendarRange, color: '#8560DB', to: '/calendar' },
  habits: { label: 'العادات', icon: Flame, color: '#EE8A2C', to: '/habits' },
  stats: { label: 'الإحصائيات', icon: ChartColumn, color: '#22A06B', to: '/stats' },
  projects: { label: 'المشاريع', icon: FolderKanban, color: '#5A63D6', to: '/projects' },
  settings: { label: 'الإعدادات', icon: Settings, color: '#8E96A0', to: '/settings' },
} satisfies Record<string, { label: string; icon: LucideIcon; color: string; to: string }>;

export type ViewKey = keyof typeof VIEWS;

export function ViewIcon({ view, size = 18 }: { view: ViewKey; size?: number }) {
  const I = VIEWS[view].icon;
  return <I size={size} strokeWidth={1.8} />;
}

export function PageTitle({
  view, icon, title, subtitle, actions,
}: { view?: ViewKey; icon?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="titles">
        <h1 className="h1">
          {view ? <span className="h1-icon" style={{ color: VIEWS[view].color }}><ViewIcon view={view} size={26} /></span> : icon}
          <span>{title}</span>
        </h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/** Things-style progress pie. */
export function ProgressPie({ value, color, size = 18 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 1;
  const inner = r - 2.5;
  const c = size / 2;
  const a = Math.min(Math.max(value, 0), 1) * Math.PI * 2;
  const x = c + inner * Math.sin(a);
  const y = c - inner * Math.cos(a);
  const large = a > Math.PI ? 1 : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flex: 'none', transform: 'scaleX(-1)' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={1.6} />
      {value >= 1 ? (
        <circle cx={c} cy={c} r={inner} fill={color} />
      ) : value > 0 ? (
        <path d={`M${c},${c} L${c},${c - inner} A${inner},${inner} 0 ${large} 1 ${x},${y} Z`} fill={color} />
      ) : null}
    </svg>
  );
}
