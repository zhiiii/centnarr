'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, TeamView } from '@/lib/api';

interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  team_id: string | null;
  team_name: string | null;
  requirement_count: number;
  prd_count: number;
  created_at: string;
  updated_at: string;
}

interface ProjectGroup {
  key: string;
  title: string;
  subtitle: string;
  isPersonal: boolean;
  projects: ProjectListItem[];
}

export default function ProjectsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTeam, setNewTeam] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, t] = await Promise.all([api.listProjects(), api.teams.list()]);
      setItems(list);
      setTeams(t.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError('请输入项目名');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const p = await api.createProject(
        name,
        newDesc.trim() || undefined,
        newTeam || null,
      );
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNewTeam('');
      router.push(`/project/${p.id}`);
    } catch (e) {
      setError((e as Error).message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const groups: ProjectGroup[] = (() => {
    const personal: ProjectListItem[] = [];
    const byTeam = new Map<string, { team: TeamView; items: ProjectListItem[] }>();
    for (const p of items) {
      if (!p.team_id) {
        personal.push(p);
        continue;
      }
      const team = teams.find((t) => t.id === p.team_id);
      if (!team) {
        personal.push(p);
        continue;
      }
      if (!byTeam.has(team.id)) byTeam.set(team.id, { team, items: [] });
      byTeam.get(team.id)!.items.push(p);
    }
    const teamGroups: ProjectGroup[] = Array.from(byTeam.values()).map(({ team, items }) => ({
      key: team.id,
      title: team.name,
      subtitle: `@${team.slug} · ${team.member_count} 成员`,
      isPersonal: false,
      projects: items,
    }));
    return [
      ...teamGroups.sort((a, b) => a.title.localeCompare(b.title, 'zh')),
      {
        key: 'personal',
        title: '个人项目',
        subtitle: '仅你可见,不在任何团队空间里',
        isPersonal: true,
        projects: personal,
      },
    ].filter((g) => g.projects.length > 0);
  })();

  const totalReqs = items.reduce((s, p) => s + p.requirement_count, 0);
  const totalPrds = items.reduce((s, p) => s + p.prd_count, 0);

  return (
    <div className="min-h-[calc(100vh-48px)] px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-8 gap-4">
          <div>
            <div
              className="text-[11px] uppercase tracking-[0.18em] mb-2 gold-text"
              style={{ fontWeight: 600 }}
            >
              Project Registry
            </div>
            <h1 className="font-display text-[28px] font-semibold tracking-tight leading-tight">
              所有项目
            </h1>
            <div className="text-[12.5px] mt-2" style={{ color: 'var(--text-secondary)' }}>
              <span className="gold-text" style={{ fontWeight: 500 }}>
                {items.length}
              </span>{' '}
              个项目 ·{' '}
              <span className="gold-text" style={{ fontWeight: 500 }}>
                {totalReqs}
              </span>{' '}
              个需求 ·{' '}
              <span className="gold-text" style={{ fontWeight: 500 }}>
                {totalPrds}
              </span>{' '}
              个 PRD
              {teams.length > 0 && (
                <>
                  {' · '}
                  <Link
                    href="/teams"
                    className="hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    {teams.length} 个团队 →
                  </Link>
                </>
              )}
            </div>
          </div>
          <button onClick={() => setShowCreate((v) => !v)} className="btn btn-primary">
            {showCreate ? '取消' : '+ 新建项目'}
          </button>
        </div>

        <div className="lux-gold-hairline mb-6" />

        {showCreate && (
          <div className="lux-card p-5 mb-6">
            <CardCorners />
            <div className="text-[13px] font-medium mb-3 gold-text" style={{ fontWeight: 600 }}>
              新建项目
            </div>
            <div className="space-y-2.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="项目名（必填）"
                className="input"
                maxLength={120}
                autoFocus
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCreate();
                }}
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="项目描述（可选）"
                rows={2}
                className="input resize-none"
              />
              <div>
                <label className="text-[10.5px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  归属空间（决定谁能看/改这个项目）
                </label>
                <select
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  className="input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">个人项目（仅我自己）</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（@{t.slug} · {t.member_count} 成员）
                    </option>
                  ))}
                </select>
                {newTeam && (
                  <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                    创建后项目对该团队所有成员可见,{`{member/admin/owner}`} 可编辑
                  </div>
                )}
              </div>
              {error && (
                <div className="text-[12px]" style={{ color: 'var(--destructive)' }}>
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowCreate(false)} className="btn btn-ghost">
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="btn btn-primary"
                >
                  {creating ? '创建中…' : '创建'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="lux-card p-12 text-center">
            <CardCorners />
            <div className="lux-monogram mx-auto mb-3" style={{ width: 48, height: 48, fontSize: 18 }}>
              ◇
            </div>
            <div className="text-[14px] mb-2" style={{ color: 'var(--text-secondary)' }}>
              还没有项目
            </div>
            <div className="text-[12px] mb-5" style={{ color: 'var(--text-muted)' }}>
              一个项目对应一组相关需求（如「电商中台」包含多个子需求）
            </div>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              创建第一个项目
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.key}>
                <header className="flex items-end justify-between mb-3 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-[16px] font-semibold">{g.title}</h2>
                      <span
                        className="text-[10.5px] px-2 py-0.5 rounded mono"
                        style={{
                          background: g.isPersonal ? 'var(--bg-surface-2)' : 'rgba(94,106,210,0.16)',
                          color: g.isPersonal ? 'var(--text-muted)' : 'var(--accent)',
                          fontWeight: 600,
                        }}
                      >
                        {g.projects.length}
                      </span>
                    </div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {g.subtitle}
                    </div>
                  </div>
                </header>
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
                >
                  {g.projects.map((p) => (
                    <ProjectCard key={p.id} project={p} isPersonal={g.isPersonal} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  isPersonal,
}: {
  project: ProjectListItem;
  isPersonal: boolean;
}) {
  const monogram = (project.name || '?').trim().charAt(0).toUpperCase() || '◇';
  return (
    <Link
      href={`/project/${project.id}`}
      className="lux-card p-5 block group"
      style={{ minHeight: 168 }}
    >
      <CardCorners />
      <div className="relative flex items-start gap-3 mb-3">
        <div className="lux-monogram">{monogram}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="font-display font-semibold text-[15px] truncate flex-1">
              {project.name}
            </div>
          </div>
          <div className="text-[10.5px] mono" style={{ color: 'var(--text-muted)' }}>
            {isPersonal ? (
              <>个人空间</>
            ) : project.team_name ? (
              <>@{project.team_name}</>
            ) : (
              <>团队项目</>
            )}
          </div>
          <div
            className="text-[11.5px] mt-1.5 leading-[1.55] line-clamp-2"
            style={{ color: 'var(--text-muted)', minHeight: 32 }}
          >
            {project.description || '（无描述）'}
          </div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="flex-shrink-0 mt-1.5 transition-transform group-hover:translate-x-0.5"
          style={{ color: 'var(--text-muted)' }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      <div className="relative pt-3 mt-auto" style={{ borderTop: '1px solid var(--border-hairline)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11.5px] mono" style={{ color: 'var(--text-muted)' }}>
            <span>
              <span className="gold-text" style={{ fontWeight: 600 }}>
                {project.requirement_count}
              </span>{' '}
              需求
            </span>
            <span style={{ color: 'var(--border-strong)' }}>·</span>
            <span>
              <span className="gold-text" style={{ fontWeight: 600 }}>
                {project.prd_count}
              </span>{' '}
              PRD
            </span>
          </div>
          <div className="text-[10.5px] mono" style={{ color: 'var(--text-muted)' }}>
            {formatTime(project.updated_at)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function CardCorners() {
  return (
    <>
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
    </>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg
      className={`lux-card-corner ${pos}`}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden
    >
      <path d="M0 6 L0 0 L6 0" />
    </svg>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  } catch {
    return iso;
  }
}