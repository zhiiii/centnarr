'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, TeamView } from '@/lib/api';
import { Corner } from '@/components/Corner';
import { useDialog } from '@/components/DialogProvider';
import { Avatar } from '@/components/Avatar';

export default function TeamsPage() {
  const dialog = useDialog();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.teams.list();
      setTeams(r.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const t = await api.teams.create(name.trim(), desc.trim() || undefined);
      dialog.toast({ message: '团队已创建', variant: 'success' });
      setName('');
      setDesc('');
      await load();
      router.push(`/teams/${t.id}`);
    } catch (e) {
      dialog.alert({ title: '创建失败', description: (e as Error).message, variant: 'danger' });
    } finally {
      setCreating(false);
    }
  };

  const remove = async (t: TeamView) => {
    const ok = await dialog.confirm({
      title: `删除团队「${t.name}」?`,
      description: '团队下若有项目需先转移或删除,操作不可撤销。',
      confirmText: '永久删除',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.teams.delete(t.id);
      dialog.toast({ message: '团队已删除', variant: 'success' });
      load();
    } catch (e) {
      dialog.alert({ title: '删除失败', description: (e as Error).message, variant: 'danger' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display font-semibold text-[20px]" style={{ color: 'var(--text-primary)' }}>
            我的团队
          </h1>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
            创建团队邀请成员,把需求项目分享给协作者
          </p>
        </div>
      </div>

      <section className="lux-card relative p-5 mb-6">
        <Corner pos="tl" />
        <Corner pos="tr" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-[14px]" style={{ color: 'var(--text-primary)' }}>
            新建团队
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              团队名
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="例如:产品研发组"
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
              描述 (可选)
            </span>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={200}
              placeholder="团队定位或备注"
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
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="btn btn-primary !py-2 !px-4 text-[12.5px]"
          >
            {creating ? '创建中…' : '创建'}
          </button>
        </div>
      </section>

      {loading ? (
        <div className="text-center text-[12.5px] py-12" style={{ color: 'var(--text-muted)' }}>
          加载中…
        </div>
      ) : teams.length === 0 ? (
        <div className="lux-card p-12 text-center">
          <div
            className="lux-monogram mx-auto mb-3"
            style={{ width: 48, height: 48, fontSize: 18 }}
          >
            ◇
          </div>
          <div className="text-[14px] mb-2" style={{ color: 'var(--text-secondary)' }}>
            你还没有加入任何团队
          </div>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            创建团队后可邀请协作者共同维护需求项目
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/teams/${t.id}`}
              className="lux-card relative p-5 block transition-colors hover:border-[--accent]"
            >
              <Corner pos="tl" />
              <Corner pos="br" />
              <div className="flex items-start justify-between mb-2 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-display font-semibold text-[15px] truncate" style={{ color: 'var(--text-primary)' }}>
                    {t.name}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    @{t.slug}
                  </div>
                </div>
                <RoleTag role={t.my_role} />
              </div>
              {t.description && (
                <p className="text-[12.5px] leading-[1.5] line-clamp-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {t.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                <span className="inline-flex items-center gap-1">
                  <span>👥</span> {t.member_count} 成员
                </span>
                <span className="inline-flex items-center gap-1">
                  <span>📁</span> {t.project_count} 项目
                </span>
              </div>
              {t.my_role === 'owner' && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    remove(t);
                  }}
                  className="text-[11px] mt-3 transition-colors"
                  style={{ color: 'var(--destructive)' }}
                >
                  删除团队
                </button>
              )}
            </Link>
          ))}
        </div>
      )}
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