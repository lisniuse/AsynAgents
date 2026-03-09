export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'asyn_theme_mode';

export const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const getStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
};

export const setStoredTheme = (mode: ThemeMode): void => {
  localStorage.setItem(STORAGE_KEY, mode);
};

export const applyTheme = (mode: ThemeMode): 'light' | 'dark' => {
  const effectiveTheme = mode === 'system' ? getSystemTheme() : mode;
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  return effectiveTheme;
};
