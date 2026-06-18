'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  requirement_count: number;
  prd_count: number;
  created_at: string;
  updated_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .listProjects()
      .then(setItems)
      .finally(() => setLoading(false));
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
      const p = await api.createProject(name, newDesc.trim() || undefined);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      router.push(`/project/${p.id}`);
    } catch (e) {
      setError((e as Error).message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

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
              一个项目对应一组相关需求 ·{' '}
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
            <div className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="项目名（必填）"
                className="input"
                maxLength={120}
                autoFocus
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="项目描述（可选）"
                rows={2}
                className="input resize-none"
              />
              {error && (
                <div className="text-[12px]" style={{ color: 'var(--destructive)' }}>
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowCreate(false)} className="btn btn-ghost">
                  取消
                </button>
                <button onClick={handleCreate} disabled={creating} className="btn btn-primary">
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
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
          >
            {items.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectListItem }) {
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
          <div className="font-display font-semibold text-[15px] truncate">{project.name}</div>
          <div
            className="text-[11.5px] mt-1 leading-[1.55] line-clamp-2"
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
