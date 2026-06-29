'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDialog } from '@/components/DialogProvider';
import { useAuth } from '@/components/AuthProvider';

export default function RegisterPage() {
  const { register, status, user } = useAuth();
  const dialog = useDialog();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
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
      await register(email.trim().toLowerCase(), password, displayName.trim());
      dialog.toast({ message: '注册成功,欢迎加入', variant: 'success' });
      router.replace('/');
    } catch (err) {
      await dialog.alert({
        title: '注册失败',
        description: (err as Error).message,
        variant: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const pwHint =
    password.length === 0
      ? ' '
      : password.length < 8
      ? '密码至少 8 位'
      : !/[A-Za-z]/.test(password) || !/\d/.test(password)
      ? '需包含字母和数字'
      : '✓ 密码强度 OK';

  const pwHintColor =
    password.length === 0
      ? 'transparent'
      : password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)
      ? 'var(--warning)'
      : 'var(--success)';

  const valid =
    /\S+@\S+\.\S+/.test(email) &&
    displayName.trim().length > 0 &&
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password);

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
              创建账号
            </div>
            <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              几秒钟搞定,就可以开始跟 AI 聊需求
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
              label="昵称"
              type="text"
              value={displayName}
              onChange={setDisplayName}
              placeholder="大家怎么称呼你?"
              autoComplete="nickname"
              required
            />
            <Field
              label="密码"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="至少 8 位,含字母和数字"
              autoComplete="new-password"
              required
            />
            <div
              className="text-[11px] -mt-2 h-3 transition-colors"
              style={{ color: pwHintColor }}
            >
              {pwHint}
            </div>
            <button
              type="submit"
              disabled={submitting || !valid}
              className="btn btn-primary w-full !py-2.5 !text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '注册中...' : '注册并登录'}
            </button>
          </form>
          <div className="mt-5 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
            已有账号？
            <Link
              href="/login"
              className="ml-1 font-medium"
              style={{ color: 'var(--accent)' }}
            >
              直接登录
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