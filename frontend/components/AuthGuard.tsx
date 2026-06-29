'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';

const PUBLIC_PATHS = new Set(['/login', '/register']);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'loading') return;
    const isPublic = PUBLIC_PATHS.has(pathname);
    if (status === 'anonymous' && !isPublic) {
      router.replace('/login');
    }
    if (status === 'authenticated' && isPublic) {
      router.replace('/');
    }
  }, [status, pathname, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div
          className="text-[12.5px]"
          style={{ color: 'var(--text-muted)' }}
        >
          加载中…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}