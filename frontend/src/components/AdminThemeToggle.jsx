import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useAdminTheme } from '../utils/adminTheme';

/**
 * Executive Dark + White Segmented Theme Switcher
 * Syncs live across Super Admin, Sales, Marketing, Graphics, and Admin Sign-In.
 */
export default function AdminThemeToggle({ compact = false, className = '' }) {
  const { theme, isDark, setTheme, toggleTheme } = useAdminTheme({ syncDocument: false });

  if (compact) {
    return (
      <button
        type="button"
        className={`adm-theme-compact-btn ${isDark ? 'is-dark' : 'is-light'} ${className}`.trim()}
        onClick={toggleTheme}
        title={isDark ? 'Switch to White Theme' : 'Switch to Dark Theme'}
        aria-label={isDark ? 'Switch to White Theme' : 'Switch to Dark Theme'}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    );
  }

  return (
    <div
      className={`adm-theme-segmented ${isDark ? 'is-dark' : 'is-light'} ${className}`.trim()}
      role="group"
      aria-label="Admin Workspace Theme"
    >
      <button
        type="button"
        className={`adm-theme-seg-btn ${theme === 'light' ? 'active' : ''}`}
        onClick={() => setTheme('light')}
        title="Executive White + Dark Contrast Theme"
      >
        <Sun size={13} strokeWidth={2.4} />
        <span className="adm-theme-seg-label">White</span>
      </button>
      <button
        type="button"
        className={`adm-theme-seg-btn ${theme === 'dark' ? 'active' : ''}`}
        onClick={() => setTheme('dark')}
        title="Executive Obsidian Dark Theme"
      >
        <Moon size={13} strokeWidth={2.4} />
        <span className="adm-theme-seg-label">Dark</span>
      </button>
    </div>
  );
}
