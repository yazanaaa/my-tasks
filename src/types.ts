export type Priority = 0 | 1 | 2 | 3;

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  /** Sidebar look saved on the account; null until the user picks one. */
  theme: 'light' | 'dark' | null;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  projectId: string | null;
  sectionId: string | null;
  parentId: string | null;
  priority: Priority;
  dueDate: string | null; // YYYY-MM-DD, local
  dueTime: string | null; // HH:MM
  recurrence: string | null;
  tags: string[];
  completed: boolean;
  completedAt: number | null;
  pinned: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  view: 'list' | 'board';
  dueDate: string | null;
  archived: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  icon: string;
  days: number[]; // 0 = Sunday … 6 = Saturday
  archived: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface HabitLog {
  habitId: string;
  date: string;
}

export type IdeaSource = 'app' | 'palette' | 'share' | 'link' | 'draft' | 'import';

export interface Idea {
  id: string;
  text: string; // trimmed, ≤ 4000; the first non-empty line is the title
  tags: string[]; // derived from #tags inside the text
  color: string; // one of IDEA_COLORS[].hue
  pinned: boolean;
  archived: boolean;
  source: IdeaSource;
  taskId: string | null; // no foreign key, so it may dangle
  projectId: string | null;
  convertedAt: number | null;
  surfacedAt: number | null; // last time the daily spark acted on it
  createdAt: number;
  updatedAt: number;
}

/** «يومية» checklist item: done while checkedAt is after the latest 5 AM (see lib/dates dailyBoundary). */
export interface DailyItem {
  id: string;
  title: string;
  checkedAt: number | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Bootstrap {
  user: User;
  projects: Project[];
  sections: Section[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  ideas: Idea[];
  dailyItems: DailyItem[];
}
