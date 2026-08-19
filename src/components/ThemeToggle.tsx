'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
}

function getThemeSnapshot(): boolean {
  const saved = localStorage.getItem('univmis-theme');
  if (saved) return saved === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getServerThemeSnapshot(): boolean {
  return true;
}

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getThemeSnapshot, getServerThemeSnapshot);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark, mounted]);

  const toggle = useCallback(() => {
    const next = !isDark;
    const theme = next ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('univmis-theme', theme);
    window.dispatchEvent(new StorageEvent('storage', { key: 'univmis-theme' }));
  }, [isDark]);

  if (!mounted) {
    return (
      <div
        suppressHydrationWarning
        style={{
          width: '32px', height: '32px', borderRadius: '8px',
          border: '1px solid var(--border-medium)', flexShrink: 0,
        }}
      />
    );
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle theme"
      suppressHydrationWarning
      style={{
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: '1px solid var(--border-medium)',
        borderRadius: '8px',
        cursor: 'pointer',
        color: 'var(--text-secondary)',
        flexShrink: 0,
        transition: 'color 0.15s, background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.color = 'var(--accent)';
        b.style.borderColor = 'var(--accent)';
        b.style.background = 'var(--accent-dim)';
      }}
      onMouseLeave={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.color = 'var(--text-secondary)';
        b.style.borderColor = 'var(--border-medium)';
        b.style.background = 'none';
      }}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ display: 'block', flexShrink: 0 }}>
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ display: 'block', flexShrink: 0 }}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}
