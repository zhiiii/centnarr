'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { useDialog } from '@/components/DialogProvider';

const COLORS = [
  '#5E6AD2', '#22A06B', '#AD48DD', '#D99642', '#D96666',
  '#5BA8D9', '#8B6F47', '#9C4A8E', '#3B7DD8', '#6E7AD6',
];

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const dialog = useDialog();

  const [name, setName] = useState(user?.display_name || '');
  const [color, setColor] = useState(user?.avatar_color || COLORS[0]);
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  if (!user) return null;

  const saveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      await updateProfile({ display_name: name.trim(), avatar_color: color });
      dialog.toast({ message: '个人资料已更新', variant: 'success' });
    } catch (e) {
      dialog.alert({ title: '保存失败', description: (e as Error).message, variant: 'danger' });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (savingPw) return;
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      await dialog.alert({ title: '密码不符合要求', description: '至少 8 位,包含字母和数字', variant: 'warning' });
      return;
    }
    setSavingPw(true);
    try {
      const { api } = await import('@/lib/api');
      await api.auth.changePassword(oldPw, newPw);
      dialog.toast({ message: '密码已更新', variant: 'success' });
      setOldPw('');
      setNewPw('');
    } catch (e) {
      dialog.alert({ title: '修改失败', description: (e as Error).message, variant: 'danger' });
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="font-display font-semibold text-[20px]" style={{ color: 'var(--text-primary)' }}>
          个人设置
        </h1>
        <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
          管理你的昵称、头像颜色和密码
        </p>
      </div>

      <section className="lux-card relative p-6 mb-5">
        <Corner pos="tl" />
        <Corner pos="tr" />
        <h2 className="font-display font-semibold text-[14px] mb-4" style={{ color: 'var(--text-primary)' }}>
          基本资料
        </h2>
        <div className="flex items-center gap-4 mb-5">
          <Avatar name={name || user.display_name} color={color} size={56} />
          <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            头像由你昵称的前两个字自动生成
          </div>
        </div>
        <div className="space-y-3.5">
          <Field label="邮箱" value={user.email} disabled />
          <Field label="昵称" value={name} onChange={setName} maxLength={80} />
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={saveProfile}
            disabled={savingProfile || !name.trim()}
            className="btn btn-primary !py-2 !px-4 text-[12.5px]"
          >
            {savingProfile ? '保存中...' : '保存修改'}
          </button>
        </div>
      </section>

      <section className="lux-card relative p-6">
        <Corner pos="bl" />
        <Corner pos="br" />
        <h2 className="font-display font-semibold text-[14px] mb-4" style={{ color: 'var(--text-primary)' }}>
          修改密码
        </h2>
        <div className="space-y-3.5">
          <Field label="当前密码" type="password" value={oldPw} onChange={setOldPw} />
          <Field label="新密码" type="password" value={newPw} onChange={setNewPw} hint="至少 8 位,含字母和数字" />
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={changePassword}
            disabled={savingPw || !oldPw || !newPw}
            className="btn btn-primary !py-2 !px-4 text-[12.5px]"
          >
            {savingPw ? '更新中...' : '更新密码'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
  hint,
  maxLength,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  disabled?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        className="w-full px-3 py-2.5 rounded-md text-[13px] outline-none transition-colors disabled:opacity-70"
        style={{
          background: disabled ? 'var(--bg-surface-1)' : 'var(--bg-surface-2)',
          border: '1px solid var(--border-hairline)',
          color: 'var(--text-primary)',
        }}
        onFocus={(e) => {
          if (!disabled) e.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-hairline)';
        }}
      />
      {hint && (
        <span className="text-[11px] mt-1 block" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="text-[10.5px] uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
        头像颜色
      </span>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className="w-7 h-7 rounded-full transition-transform hover:scale-[1.08]"
            style={{
              background: c,
              outline: value === c ? '2px solid var(--accent)' : '2px solid transparent',
              outlineOffset: 2,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
            }}
            aria-label={`选择 ${c}`}
          />
        ))}
      </div>
    </div>
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