'use client';

import { useState } from 'react';
import { CommunicationCard } from '@/lib/api';

interface DeltaItem {
  field?: string;
  content?: string;
  before?: string;
  after?: string;
  description?: string;
  [k: string]: unknown;
}

export function CommunicationTimeline({ cards }: { cards: CommunicationCard[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (cards.length === 0) return null;

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="px-6 py-4">
      <div
        className="text-[11px] uppercase tracking-wider mb-3"
        style={{ color: 'var(--text-muted)', fontWeight: 600 }}
      >
        沟通记录（{cards.length}）
      </div>
      <div className="space-y-2">
        {cards
          .slice()
          .reverse()
          .map((c) => {
            const isOpen = expandedId === c.id;
            const delta = (c.delta || {}) as {
              added?: DeltaItem[];
              modified?: DeltaItem[];
              confirmed?: DeltaItem[];
              edited?: DeltaItem[];
            };
            return (
              <div key={c.id} className="surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="w-full p-3 flex items-center gap-3 text-left"
                  style={{ background: 'transparent' }}
                  aria-expanded={isOpen}
                >
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-mono flex-shrink-0"
                    style={{
                      background: kindColor(c.communication_kind).bg,
                      color: kindColor(c.communication_kind).fg,
                    }}
                  >
                    R{c.round}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[12px]">
                      <span style={{ color: 'var(--text-primary)' }} className="font-medium">
                        {kindLabel(c.communication_kind)}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span className="mono" style={{ color: 'var(--text-muted)' }}>
                        {formatTime(c.created_at)}
                      </span>
                    </div>
                    <div className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                      {summarizeDelta(delta)}
                    </div>
                  </div>
                  <span className="tag">已整理</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      color: 'var(--text-muted)',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 150ms ease-out',
                      flexShrink: 0,
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                {isOpen && (
                  <div
                    className="px-3 pb-3 pt-1 space-y-3"
                    style={{ borderTop: '1px solid var(--border-hairline)' }}
                  >
                    {delta.added && delta.added.length > 0 && (
                      <DeltaSection
                        title="新增"
                        color="var(--success)"
                        items={delta.added.map((it) => ({ field: it.field, content: it.content || it.description }))}
                      />
                    )}
                    {delta.modified && delta.modified.length > 0 && (
                      <DeltaSection
                        title="修改"
                        color="var(--warning)"
                        items={delta.modified.map((it) => ({
                          field: it.field,
                          before: it.before,
                          after: it.after,
                          content: it.content || it.description,
                        }))}
                        mode="diff"
                      />
                    )}
                    {delta.confirmed && delta.confirmed.length > 0 && (
                      <DeltaSection
                        title="确认"
                        color="var(--accent)"
                        items={delta.confirmed.map((it) => ({ field: it.field, content: it.content || it.description }))}
                      />
                    )}
                    {delta.edited && delta.edited.length > 0 && (
                      <DeltaSection
                        title="手动编辑"
                        color="var(--text-secondary)"
                        items={delta.edited.map((it) => ({ field: it.field, content: it.content || it.description }))}
                      />
                    )}
                    {!delta.added?.length && !delta.modified?.length && !delta.confirmed?.length && !delta.edited?.length && (
                      <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                        本轮没有需要结构化整理的内容。
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function DeltaSection({
  title,
  color,
  items,
  mode = 'plain',
}: {
  title: string;
  color: string;
  items: Array<{ field?: string; content?: string; before?: string; after?: string }>;
  mode?: 'plain' | 'diff';
}) {
  return (
    <div>
      <div className="text-[10.5px] font-medium uppercase tracking-wider mb-1" style={{ color }}>
        {title} · {items.length}
      </div>
      <div className="space-y-1.5">
        {items.map((it, idx) => (
          <div
            key={idx}
            className="p-2 rounded-md text-[11.5px]"
            style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-hairline)' }}
          >
            {it.field && (
              <div className="font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
                {it.field}
              </div>
            )}
            {mode === 'diff' && (it.before || it.after) ? (
              <div className="leading-[1.55]">
                {it.before && (
                  <div style={{ color: 'var(--destructive)' }}>
                    <span className="mono">−</span> {truncate(it.before, 120)}
                  </div>
                )}
                {it.after && (
                  <div style={{ color: 'var(--success)' }}>
                    <span className="mono">+</span> {truncate(it.after, 120)}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>{truncate(it.content || '—', 160)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function kindLabel(kind: string): string {
  const m: Record<string, string> = {
    ai_ask: 'AI 主动反问',
    user_supplement: '业务人员补充',
    async_supplement: '异步补充',
  };
  return m[kind] || kind;
}

function kindColor(kind: string): { bg: string; fg: string } {
  if (kind === 'ai_ask') return { bg: 'rgba(94,106,210,0.15)', fg: 'var(--accent)' };
  if (kind === 'user_supplement') return { bg: 'rgba(76,183,130,0.15)', fg: 'var(--success)' };
  return { bg: 'rgba(242,201,76,0.15)', fg: 'var(--warning)' };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
}

function truncate(s: string, n: number): string {
  if (s == null) return '';
  const text = typeof s === 'string' ? s : (() => { try { return JSON.stringify(s); } catch { return String(s); } })();
  return text.length > n ? text.slice(0, n) + '…' : text;
}

function summarizeDelta(delta: { added?: unknown[]; modified?: unknown[]; confirmed?: unknown[] }): string {
  const parts: string[] = [];
  if (delta.added?.length) parts.push(`+${delta.added.length} 新增`);
  if (delta.modified?.length) parts.push(`~${delta.modified.length} 修改`);
  if (delta.confirmed?.length) parts.push(`✓${delta.confirmed.length} 确认`);
  return parts.length > 0 ? parts.join(' · ') : '已整理';
}
