'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDialog } from '@/components/DialogProvider';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const { login, status, user } = useAuth();
  const dialog = useDialog();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace('/');
    }
  }, [status, user, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      dialog.toast({ message: '登录成功', variant: 'success' });
      router.replace('/');
    } catch (err) {
      await dialog.alert({
        title: '登录失败',
        description: (err as Error).message,
        variant: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center p-6">
      <div className="lux-card relative w-full max-w-[420px] p-8">
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
        <div className="relative">
          <div className="text-center mb-7">
            <div className="font-display font-semibold text-[22px] mb-1.5" style={{ color: 'var(--text-primary)' }}>
              欢迎回来
            </div>
            <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              登录后可以继续之前的对话和团队协作
            </div>
          </div>
          <form onSubmit={onSubmit} className="space-y-3.5">
            <Field
              label="邮箱"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <Field
              label="密码"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="btn btn-primary w-full !py-2.5 !text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>
          <div className="mt-5 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
            还没有账号？
            <Link
              href="/register"
              className="ml-1 font-medium"
              style={{ color: 'var(--accent)' }}
            >
              立即注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full px-3 py-2.5 rounded-md text-[13px] outline-none transition-colors"
        style={{
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border-hairline)',
          color: 'var(--text-primary)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-hairline)';
        }}
      />
    </label>
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