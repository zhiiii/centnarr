'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UserMenu } from './UserMenu';

const links = [
  { href: '/', label: '新建需求' },
  { href: '/projects', label: '项目' },
];

export function TopNav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const t = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
    setTheme(t);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('centnarr-theme', next);
    } catch {}
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-12 backdrop-blur"
      style={{
        background: 'color-mix(in srgb, var(--bg-ground) 85%, transparent)',
        borderBottom: '1px solid var(--border-hairline)',
      }}
    >
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 font-display font-semibold tracking-tight">
          百叙成章
        </Link>
        <div className="flex items-center gap-1 text-[13px]">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-1.5 rounded-md transition-colors"
                style={{
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: active ? 'var(--bg-surface-2)' : 'transparent',
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="btn btn-ghost !p-2"
          aria-label="切换主题"
          title="切换主题"
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        <UserMenu />
      </div>
    </nav>
  );
}