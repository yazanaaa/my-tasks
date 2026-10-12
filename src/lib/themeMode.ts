import { useSyncExternalStore } from 'react';

// Violet sidebar (the sidebar and the frame around the page; the page stays white).
// The account keeps the choice (users.theme, applied on every load by store.ts); localStorage
// mirrors it so index.html can apply it before first paint, even signed out.
export type ThemeMode = 'light' | 'dark';

const KEY = 'mt:theme';
const THEME_COLOR: Record<ThemeMode, string> = { light: '#FFFFFF', dark: '#7A4CF6' };
const listeners = new Set<() => void>();

export function currentThemeMode(): ThemeMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Applies the look on this device only; store.toggleTheme also saves it on the account. */
export function setThemeMode(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private mode: the account still has it for next time.
  }
  listeners.forEach((l) => l());
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    currentThemeMode,
  );
}
