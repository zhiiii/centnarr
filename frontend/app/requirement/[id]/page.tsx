'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, DocView, MessageTurn } from '@/lib/api';
import { PrdViewer } from '@/components/PrdViewer';

interface RequirementData {
  id: string;
  conversation_id: string;
  project_id: string | null;
  project_name: string | null;
  title: string;
  status: string;
  confirmed_doc: DocView;
  prds: Array<{
    id: string;
    version: string;
    content: string;
    created_at: string;
    acceptance_state?: Record<string, boolean>;
    spec_content?: string | null;
    spec_version?: string | null;
    spec_updated_at?: string | null;
  }>;
  updated_at: string;
}

export default function RequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<RequirementData | null>(null);
  const [messages, setMessages] = useState<MessageTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [specViewer, setSpecViewer] = useState<{ content: string; version: string } | null>(null);
  const [generatingSpec, setGeneratingSpec] = useState(false);

  const refresh = () => {
    api
      .getRequirement(id)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  };

  useEffect(() => {
    refresh();
    setLoading(true);
    api
      .getRequirement(id)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (data?.conversation_id) {
      api.getConversation(data.conversation_id).then((c) => setMessages(c.messages));
    }
  }, [data?.conversation_id]);

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
            {error || '需求不存在'}
          </div>
          <button onClick={() => router.push('/projects')} className="btn btn-ghost">
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  const prd = data.prds[0];
  const isArchived = data.status === 'archived';
  const backHref = data.project_id ? `/project/${data.project_id}` : '/projects';
  const backLabel = data.project_id
    ? (data.project_name ? `返回「${data.project_name}」` : '返回项目')
    : '返回项目列表';

  const toggleArchive = async () => {
    if (!data) return;
    const ok = window.confirm(isArchived ? '确认取消归档？' : '确认归档此需求？归档后默认筛选中不会显示。');
    if (!ok) return;
    try {
      if (isArchived) {
        await api.unarchiveRequirement(data.id);
      } else {
        await api.archiveRequirement(data.id);
      }
      refresh();
    } catch (e) {
      window.alert((e as Error).message || '操作失败');
    }
  };

  const handleGenerateSpec = async () => {
    if (!prd) return;
    setGeneratingSpec(true);
    try {
      const res = await api.generateSpec(prd.id);
      setSpecViewer({ content: res.spec_content, version: res.spec_version });
      refresh();
    } catch (e) {
      window.alert((e as Error).message || 'Spec 生成失败');
    } finally {
      setGeneratingSpec(false);
    }
  };

  const handleViewSpec = () => {
    if (prd?.spec_content) {
      setSpecViewer({ content: prd.spec_content, version: prd.spec_version || 'v1.0' });
    }
  };

  return (
    <div className="min-h-[calc(100vh-48px)] px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            需求详情 {isArchived && <span className="ml-2 tag">已归档</span>}
          </div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight">{data.title}</h1>
        </div>

        <div
          className="flex items-center gap-2 mb-6 pb-4"
          style={{ borderBottom: '1px solid var(--border-hairline)' }}
        >
          {prd?.spec_content ? (
            <button onClick={handleViewSpec} className="btn btn-ghost">
              查看 Spec
            </button>
          ) : prd ? (
            <button onClick={handleGenerateSpec} disabled={generatingSpec} className="btn btn-ghost">
              {generatingSpec ? '生成中…' : '生成 Spec'}
            </button>
          ) : null}
          <button onClick={toggleArchive} className="btn btn-ghost">
            {isArchived ? '取消归档' : '归档'}
          </button>
          <Link
            href={`/conversation/${data.conversation_id}`}
            title="返回聊天"
            aria-label="返回聊天"
            className="btn btn-ghost"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 6,
              color: 'var(--accent)',
              border: '1px solid rgba(94, 106, 210, 0.28)',
              background: 'rgba(94, 106, 210, 0.12)',
              textDecoration: 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回聊天
          </Link>
          <Link href={backHref} className="btn btn-ghost">
            {backLabel}
          </Link>
        </div>

        {prd ? (
          <div className="lux-card p-6">
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            <PrdViewer
              prd={{
                prd_id: prd.id,
                title: data.title,
                content: prd.content,
                version: prd.version,
                acceptance_state: prd.acceptance_state,
              }}
              onUpdated={refresh}
            />
          </div>
        ) : (
          <div className="lux-card p-6">
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            <div className="text-[14px] font-medium mb-3 gold-text" style={{ fontWeight: 600 }}>
              业务确认稿
            </div>
            <DocSummary doc={data.confirmed_doc} />
          </div>
        )}

        <div className="lux-card p-6 mt-4">
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-medium">完整沟通记录</div>
          </div>
          {messages.length === 0 ? (
            <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
              暂无对话内容
            </div>
          ) : (
            <ChatTranscript messages={messages} />
          )}
        </div>
      </div>

      {specViewer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSpecViewer(null)}
        >
          <div
            className="lux-card max-w-4xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border-hairline)' }}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-[14px]">Spec 文档</span>
                <span className="tag">{specViewer.version}</span>
              </div>
              <button onClick={() => setSpecViewer(null)} className="btn btn-ghost !p-1.5" title="关闭">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto flex-1">
              <pre
                className="text-[12.5px] leading-[1.7] whitespace-pre-wrap"
                style={{ color: 'var(--text-primary)', fontFamily: 'inherit' }}
              >
                {specViewer.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatTranscript({ messages }: { messages: MessageTurn[] }) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => {
        const isUser = m.role === 'user';
        return (
          <div
            key={i}
            className="flex gap-3"
            style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10.5px] font-medium flex-shrink-0"
              style={{
                background: isUser ? 'var(--bg-surface-3)' : 'var(--accent)',
                color: isUser ? 'var(--text-secondary)' : 'var(--bg-ground)',
              }}
            >
              {isUser ? 'U' : 'AI'}
            </div>
            <div
              className="flex-1 max-w-[80%] rounded-md p-3 text-[13px] leading-[1.65] whitespace-pre-wrap"
              style={{
                background: isUser ? 'var(--bg-surface-2)' : 'var(--bg-surface-1)',
                border: '1px solid var(--border-hairline)',
                color: 'var(--text-primary)',
              }}
            >
              {m.content || <span style={{ color: 'var(--text-muted)' }}>（空消息）</span>}
              <div className="text-[10.5px] mt-1.5 mono" style={{ color: 'var(--text-muted)' }}>
                {formatTs(m.created_at)}
                {m.input_type && m.input_type !== 'text' && ` · ${m.input_type}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  } catch {
    return iso;
  }
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

function DocSummary({ doc }: { doc: DocView }) {
  return (
    <div className="space-y-4 text-[13px]">
      {doc.background && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            背景
          </div>
          <div className="leading-[1.7]">{doc.background}</div>
        </div>
      )}
      {doc.roles.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            角色
          </div>
          <div className="flex flex-wrap gap-2">
            {doc.roles.map((r, i) => (
              <span key={i} className="tag">{r.name}</span>
            ))}
          </div>
        </div>
      )}
      {doc.pain_points.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            痛点
          </div>
          <ul className="space-y-1">
            {doc.pain_points.map((p, i) => (
              <li key={i}>· {p.description}</li>
            ))}
          </ul>
        </div>
      )}
      {doc.expected_outcomes.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            期望效果
          </div>
          <ul className="space-y-1">
            {doc.expected_outcomes.map((e, i) => (
              <li key={i}>· {e.description}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}