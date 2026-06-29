'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, TeamView } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { Corner } from '@/components/Corner';
import { useDialog } from '@/components/DialogProvider';
import { useAuth } from '@/components/AuthProvider';

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const dialog = useDialog();
  const { user: me } = useAuth();
  const [team, setTeam] = useState<TeamView | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const t = await api.teams.get(id);
      setTeam(t);
    } catch (e) {
      dialog.alert({ title: '加载失败', description: (e as Error).message, variant: 'danger' });
      router.push('/teams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading || !team) {
    return (
      <div className="text-center text-[12.5px] py-12" style={{ color: 'var(--text-muted)' }}>
        加载中…
      </div>
    );
  }

  const isAdmin = team.my_role === 'owner' || team.my_role === 'admin';

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.teams.addMember(team.id, inviteEmail.trim(), inviteRole);
      dialog.toast({ message: '成员已添加', variant: 'success' });
      setInviteEmail('');
      load();
    } catch (e) {
      dialog.alert({ title: '添加失败', description: (e as Error).message, variant: 'danger' });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (user_id: string, role: string) => {
    try {
      await api.teams.updateMember(team.id, user_id, role);
      load();
    } catch (e) {
      dialog.alert({ title: '更新失败', description: (e as Error).message, variant: 'danger' });
    }
  };

  const removeMember = async (user_id: string, name: string) => {
    const ok = await dialog.confirm({
      title: `移除成员 ${name}?`,
      description: '该成员将失去团队访问权限,但其个人项目仍保留。',
      confirmText: '确认移除',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.teams.removeMember(team.id, user_id);
      dialog.toast({ message: '成员已移除', variant: 'success' });
      load();
    } catch (e) {
      dialog.alert({ title: '移除失败', description: (e as Error).message, variant: 'danger' });
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button
        onClick={() => router.push('/teams')}
        className="text-[12px] mb-3 transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        ← 返回我的团队
      </button>

      <div className="lux-card relative p-6 mb-5">
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="br" />
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display font-semibold text-[20px] truncate" style={{ color: 'var(--text-primary)' }}>
                {team.name}
              </h1>
              <RoleTag role={team.my_role} />
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              @{team.slug} · {team.member_count} 成员 · {team.project_count} 项目
            </div>
          </div>
        </div>
        {team.description && (
          <p className="text-[13px] leading-[1.5] mt-2" style={{ color: 'var(--text-secondary)' }}>
            {team.description}
          </p>
        )}
      </div>

      {isAdmin && (
        <section className="lux-card relative p-5 mb-5">
          <Corner pos="tl" />
          <Corner pos="tr" />
          <h2 className="font-display font-semibold text-[14px] mb-3" style={{ color: 'var(--text-primary)' }}>
            添加成员
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
            <label className="block">
              <span className="text-[10.5px] uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                用户邮箱 (必须是已注册用户)
              </span>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                type="email"
                className="w-full px-3 py-2 rounded-md text-[13px] outline-none transition-colors"
                style={{
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-hairline)')}
              />
            </label>
            <label className="block">
              <span className="text-[10.5px] uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                角色
              </span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-[13px] outline-none transition-colors"
                style={{
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button
              onClick={invite}
              disabled={inviting || !inviteEmail.trim()}
              className="btn btn-primary !py-2 !px-4 text-[12.5px]"
            >
              {inviting ? '添加中…' : '添加'}
            </button>
          </div>
        </section>
      )}

      <section className="lux-card relative p-5">
        <Corner pos="bl" />
        <Corner pos="br" />
        <h2 className="font-display font-semibold text-[14px] mb-3" style={{ color: 'var(--text-primary)' }}>
          成员列表 · {team.members?.length || 0}
        </h2>
        <ul className="space-y-1">
          {(team.members || []).map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors hover:bg-[--bg-surface-2]"
            >
              <Avatar name={m.display_name} color={m.avatar_color} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {m.display_name}
                  {m.user_id === me?.id && (
                    <span
                      className="ml-2 text-[10.5px] px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--bg-surface-3)', color: 'var(--text-muted)' }}
                    >
                      你
                    </span>
                  )}
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {m.email}
                </div>
              </div>
              {m.role === 'owner' ? (
                <RoleTag role="owner" />
              ) : isAdmin ? (
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.user_id, e.target.value)}
                    className="text-[11.5px] px-2 py-1 rounded outline-none"
                    style={{
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-hairline)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                    disabled={m.user_id === me?.id}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {m.user_id !== me?.id && (
                    <button
                      onClick={() => removeMember(m.user_id, m.display_name)}
                      className="text-[11px] px-2 py-1 rounded transition-colors"
                      style={{ color: 'var(--destructive)' }}
                    >
                      移除
                    </button>
                  )}
                </div>
              ) : (
                <RoleTag role={m.role} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RoleTag({ role }: { role: string }) {
  const m: Record<string, { label: string; bg: string; fg: string }> = {
    owner: { label: 'Owner', bg: 'rgba(94, 106, 210, 0.16)', fg: 'var(--accent)' },
    admin: { label: 'Admin', bg: 'rgba(242, 201, 76, 0.16)', fg: 'var(--warning)' },
    member: { label: 'Member', bg: 'var(--bg-surface-3)', fg: 'var(--text-secondary)' },
    viewer: { label: 'Viewer', bg: 'var(--bg-surface-3)', fg: 'var(--text-muted)' },
  };
  const v = m[role] || m.member;
  return (
    <span
      className="text-[10.5px] px-2 py-0.5 rounded"
      style={{ background: v.bg, color: v.fg, fontWeight: 600 }}
    >
      {v.label}
    </span>
  );
}