import { useState, useEffect, useCallback } from 'react';

const ADMIN_THEME_KEY = 'admafia_admin_theme';
const ADMIN_THEME_EVENT = 'admafia_admin_theme_changed';

export function getAdminTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(ADMIN_THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (_) {}
  return 'light';
}

export function setAdminTheme(nextTheme) {
  const normalized = nextTheme === 'dark' ? 'dark' : 'light';
  if (typeof window === 'undefined') return normalized;
  try {
    localStorage.setItem(ADMIN_THEME_KEY, normalized);
  } catch (_) {}
  try {
    if (document.documentElement.hasAttribute('data-admin-active-theme')) {
      document.documentElement.setAttribute('data-admin-active-theme', normalized);
    }
    window.dispatchEvent(new CustomEvent(ADMIN_THEME_EVENT, { detail: { theme: normalized } }));
  } catch (_) {}
  return normalized;
}

export function toggleAdminTheme() {
  return setAdminTheme(getAdminTheme() === 'dark' ? 'light' : 'dark');
}

/**
 * React hook for synchronized Dark + White theme across Super Admin, Sales,
 * Marketing, Graphics, and Admin Login workspaces.
 */
export function useAdminTheme({ syncDocument = true } = {}) {
  const [theme, setThemeState] = useState(getAdminTheme);

  useEffect(() => {
    const handleSync = (e) => {
      const incoming = e?.detail?.theme || getAdminTheme();
      setThemeState(incoming === 'dark' ? 'dark' : 'light');
    };
    const handleStorage = (e) => {
      if (!e || e.key === ADMIN_THEME_KEY) {
        setThemeState(getAdminTheme());
      }
    };
    window.addEventListener(ADMIN_THEME_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(ADMIN_THEME_EVENT, handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!syncDocument || typeof document === 'undefined') return undefined;
    document.documentElement.setAttribute('data-admin-active-theme', theme);
    return () => {
      // Clean up root attribute only if leaving admin routes completely
      setTimeout(() => {
        if (typeof document !== 'undefined' && !document.querySelector('.adm-theme-scope')) {
          document.documentElement.removeAttribute('data-admin-active-theme');
        }
      }, 0);
    };
  }, [theme, syncDocument]);

  const updateTheme = useCallback((next) => {
    const resolved = setAdminTheme(next);
    setThemeState(resolved);
  }, []);

  const toggle = useCallback(() => {
    const resolved = toggleAdminTheme();
    setThemeState(resolved);
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    setTheme: updateTheme,
    toggleTheme: toggle,
  };
}
