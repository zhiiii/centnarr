'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { useAuth } from './AuthProvider';

export function UserMenu() {
  const { user, status, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (status === 'loading') {
    return (
      <div
        className="w-8 h-8 rounded-full"
        style={{ background: 'var(--bg-surface-2)' }}
        aria-hidden
      />
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="btn btn-ghost !py-1.5 !px-3 text-[12.5px]">
          登录
        </Link>
        <Link href="/register" className="btn btn-primary !py-1.5 !px-3 text-[12.5px]">
          注册
        </Link>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full transition-transform hover:scale-[1.04]"
        aria-label="账号菜单"
      >
        <Avatar name={user.display_name} color={user.avatar_color} size={32} />
      </button>
      {open && (
        <div
          className="user-menu lux-card absolute right-0 top-[calc(100%+8px)] min-w-[240px] z-50"
          style={{ boxShadow: '0 12px 24px -6px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.04)' }}
        >
          <Corner pos="tr" />
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
            <div className="flex items-center gap-2.5">
              <Avatar name={user.display_name} color={user.avatar_color} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {user.display_name}
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {user.email}
                </div>
              </div>
            </div>
          </div>
          <div className="py-1">
            <MenuLink href="/settings" onNavigate={() => setOpen(false)}>
              <Icon path="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-.99l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.03 7.03 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.24-1.17.57-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64L4.57 11c-.04.33-.07.66-.07.99s.03.65.07.97l-2.11 1.66a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1c.52.42 1.08.74 1.69.98l.38 2.65A.5.5 0 0 0 10 22h4a.5.5 0 0 0 .5-.42l.38-2.65c.61-.24 1.17-.57 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z" />
              个人设置
            </MenuLink>
            <MenuLink href="/teams" onNavigate={() => setOpen(false)}>
              <Icon path="M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm6 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-7 6.93c.97-.43 1.84-1.05 2.59-1.79l1.4 1.42a11 11 0 0 1-3.99 2.41V22h-2v-2.03a10.99 10.99 0 0 1-3.99-2.41l1.4-1.42c.75.74 1.62 1.36 2.59 1.79V15h2v2.93Z" />
              我的团队
            </MenuLink>
            <div className="my-1" style={{ borderTop: '1px solid var(--border-hairline)' }} />
            <button
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="w-full text-left px-4 py-2 text-[12.5px] flex items-center gap-2.5 hover:bg-[--bg-surface-2] transition-colors"
              style={{ color: 'var(--destructive)' }}
            >
              <Icon path="M16 17l-1.41-1.41L17.17 13H10v-2h7.17l-2.58-2.59L16 7l5 5-5 5Zm-9-13h7v2H9v12h5v2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="block px-4 py-2 text-[12.5px] hover:bg-[--bg-surface-2] transition-colors flex items-center gap-2.5"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </Link>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, color: 'var(--text-muted)' }}
    >
      <path d={path} />
    </svg>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const styles: Record<typeof pos, React.CSSProperties> = {
    tl: { top: 0, left: 0, borderTop: '1px solid var(--accent)', borderLeft: '1px solid var(--accent)' },
    tr: { top: 0, right: 0, borderTop: '1px solid var(--accent)', borderRight: '1px solid var(--accent)' },
    bl: { bottom: 0, left: 0, borderBottom: '1px solid var(--accent)', borderLeft: '1px solid var(--accent)' },
    br: { bottom: 0, right: 0, borderBottom: '1px solid var(--accent)', borderRight: '1px solid var(--accent)' },
  };
  return <span className="absolute w-2 h-2 pointer-events-none" style={styles[pos]} />;
}