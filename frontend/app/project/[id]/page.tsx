'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Corner } from '@/components/Corner';

interface PrdItem {
  prd_id: string;
  spec_content: string | null;
  spec_version: string | null;
  spec_updated_at: string | null;
}

interface RequirementItem {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  prd_count: number;
  prds?: Array<{
    id: string;
    version: string;
    content: string;
    created_at: string;
    acceptance_state: Record<string, boolean>;
    spec_content: string | null;
    spec_version: string | null;
    spec_updated_at: string | null;
  }>;
}

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  requirement_count: number;
  prd_count: number;
  created_at: string;
  updated_at: string;
  requirements: RequirementItem[];
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [specViewer, setSpecViewer] = useState<{ prd_id: string; content: string; version: string } | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getProject(id)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleDeleteProject = async () => {
    if (!data) return;
    if (!window.confirm(`确认删除项目「${data.name}」？`)) return;
    try {
      await api.deleteProject(data.id);
      router.push('/projects');
    } catch (e) {
      window.alert((e as Error).message || '删除失败');
    }
  };

  const handleGenerateSpec = async (reqId: string, prdId: string) => {
    setGenerating((s) => ({ ...s, [prdId]: true }));
    try {
      const res = await api.generateSpec(prdId);
      setSpecViewer({ prd_id: res.prd_id, content: res.spec_content, version: res.spec_version });
      load();
    } catch (e) {
      window.alert((e as Error).message || '生成失败');
    } finally {
      setGenerating((s) => ({ ...s, [prdId]: false }));
    }
  };

  const handleViewSpec = async (prdId: string) => {
    if (!data) return;
    for (const r of data.requirements) {
      const p = (r.prds || []).find((x) => x.id === prdId);
      if (p?.spec_content) {
        setSpecViewer({ prd_id: prdId, content: p.spec_content, version: p.spec_version || 'v1.0' });
        return;
      }
    }
    await handleGenerateSpec('', prdId);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-48px)] flex items-center justify-center text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        加载中…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[calc(100vh-48px)] flex items-center justify-center">
        <div className="surface p-6 max-w-md">
          <div className="text-[14px] mb-2" style={{ color: 'var(--destructive)' }}>
            加载失败
          </div>
          <div className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            {error || '项目不存在'}
          </div>
          <button onClick={() => router.push('/projects')} className="btn btn-ghost">
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-48px)] px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-6 gap-4">
          <div className="min-w-0">
            <div
              className="text-[11px] uppercase tracking-[0.18em] mb-2 gold-text"
              style={{ fontWeight: 600 }}
            >
              Project Workspace
            </div>
            <h1 className="font-display text-[28px] font-semibold tracking-tight leading-tight">
              {data.name}
            </h1>
            {data.description && (
              <div className="text-[12.5px] mt-2" style={{ color: 'var(--text-secondary)' }}>
                {data.description}
              </div>
            )}
            <div className="text-[11.5px] mt-2" style={{ color: 'var(--text-muted)' }}>
              <span className="gold-text" style={{ fontWeight: 500 }}>
                {data.requirement_count}
              </span>{' '}
              个需求 ·{' '}
              <span className="gold-text" style={{ fontWeight: 500 }}>
                {data.prd_count}
              </span>{' '}
              个 PRD · 更新于 {formatTime(data.updated_at)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/projects" className="btn btn-ghost">
              返回项目列表
            </Link>
            <button
              onClick={() => router.push(`/?project_id=${data.id}`)}
              className="btn btn-primary"
            >
              + 为该项目新建需求
            </button>
            <button onClick={handleDeleteProject} className="btn btn-ghost" title="删除项目">
              删除
            </button>
          </div>
        </div>

        <div className="lux-gold-hairline mb-6" />

        {data.requirements.length === 0 ? (
          <div className="lux-card p-12 text-center">
            <CardCorners />
            <div
              className="lux-monogram mx-auto mb-3"
              style={{ width: 48, height: 48, fontSize: 18 }}
            >
              ◇
            </div>
            <div className="text-[14px] mb-2" style={{ color: 'var(--text-secondary)' }}>
              该项目下还没有需求
            </div>
            <div className="text-[12px] mb-5" style={{ color: 'var(--text-muted)' }}>
              点击右上角"新建需求"，所有产生的 PRD 会自动归到这个项目下
            </div>
            <button
              onClick={() => router.push(`/?project_id=${data.id}`)}
              className="btn btn-primary"
            >
              新建第一个需求
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {data.requirements.map((r) => (
              <div key={r.id} className="lux-card p-5">
                <CardCorners />
                <div className="relative flex items-center justify-between mb-3 gap-3">
                  <Link
                    href={`/requirement/${r.id}`}
                    className="font-display font-semibold text-[15px] truncate flex-1 min-w-0"
                  >
                    {r.title}
                  </Link>
                  <div className="flex items-center gap-2">
                    <StatusTag status={r.status} />
                    <span className="text-[11px] mono" style={{ color: 'var(--text-muted)' }}>
                      {formatTime(r.updated_at)}
                    </span>
                  </div>
                </div>
                {r.prd_count > 0 ? (
                  <PrdList
                    requirementId={r.id}
                    onLoadPrds={async () => {
                      const full = await api.getRequirement(r.id);
                      return full.prds;
                    }}
                    onGenerateSpec={handleGenerateSpec}
                    onViewSpec={handleViewSpec}
                    generating={generating}
                  />
                ) : (
                  <div className="text-[12px] py-2" style={{ color: 'var(--text-muted)' }}>
                    该需求尚未生成 PRD
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {specViewer && (
        <SpecModal
          content={specViewer.content}
          version={specViewer.version}
          onClose={() => setSpecViewer(null)}
        />
      )}
    </div>
  );
}

function PrdList({
  requirementId,
  onLoadPrds,
  onGenerateSpec,
  onViewSpec,
  generating,
}: {
  requirementId: string;
  onLoadPrds: () => Promise<
    Array<{
      id: string;
      version: string;
      content: string;
      created_at: string;
      acceptance_state?: Record<string, boolean>;
      spec_content?: string | null;
      spec_version?: string | null;
      spec_updated_at?: string | null;
    }>
  >;
  onGenerateSpec: (reqId: string, prdId: string) => void;
  onViewSpec: (prdId: string) => void;
  generating: Record<string, boolean>;
}) {
  const [prds, setPrds] = useState<
    Array<{
      id: string;
      version: string;
      content: string;
      created_at: string;
      acceptance_state?: Record<string, boolean>;
      spec_content?: string | null;
      spec_version?: string | null;
      spec_updated_at?: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    onLoadPrds()
      .then(setPrds)
      .finally(() => setLoading(false));
  }, [requirementId]);

  if (loading) {
    return (
      <div className="text-[12px] py-2" style={{ color: 'var(--text-muted)' }}>
        加载 PRD…
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      {prds.map((p) => {
        const isGen = !!generating[p.id];
        const hasSpec = !!p.spec_content;
        return (
          <div
            key={p.id}
            className="lux-card p-3 flex items-center justify-between"
            style={{ borderRadius: 8 }}
          >
            <Corner pos="tl" />
            <Corner pos="tr" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="tag">{p.version}</span>
                <span className="text-[12.5px] mono" style={{ color: 'var(--text-muted)' }}>
                  {formatTime(p.created_at)}
                </span>
                {hasSpec && <span className="tag tag-success">Spec 已生成</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/requirement/${requirementId}`} className="btn btn-ghost !py-1 !px-2.5 text-[12px]">
                查看 PRD
              </Link>
              {hasSpec ? (
                <button
                  onClick={() => onViewSpec(p.id)}
                  className="btn btn-ghost !py-1 !px-2.5 text-[12px]"
                >
                  查看 Spec
                </button>
              ) : (
                <button
                  onClick={() => onGenerateSpec(requirementId, p.id)}
                  disabled={isGen}
                  className="btn btn-primary !py-1 !px-2.5 text-[12px]"
                >
                  {isGen ? '生成中…' : '生成 Spec'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SpecModal({ content, version, onClose }: { content: string; version: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="lux-card max-w-4xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
          <div className="flex items-center gap-2">
            <span className="font-medium text-[14px]">Spec 文档</span>
            <span className="tag">{version}</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost !p-1.5" title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <pre className="text-[12.5px] leading-[1.7] whitespace-pre-wrap" style={{ color: 'var(--text-primary)', fontFamily: 'inherit' }}>
            {content}
          </pre>
        </div>
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const m: Record<string, { label: string; cls: string }> = {
    confirmed: { label: '已确认', cls: 'tag-warning' },
    prd_generated: { label: 'PRD 已生成', cls: 'tag-success' },
    archived: { label: '已归档', cls: '' },
  };
  const v = m[status] || { label: status, cls: '' };
  return <span className={`tag ${v.cls}`}>{v.label}</span>;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  } catch {
    return iso;
  }
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


