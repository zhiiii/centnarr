'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useShortcuts } from '@/hooks/useShortcuts';

interface Props {
  prd: { prd_id: string; title: string; content: string; version?: string; acceptance_state?: Record<string, boolean> };
  onClose: () => void;
  onUpdated?: (next: { content: string; version: string; acceptance_state: Record<string, boolean> }) => void;
}

export function PrdViewer({ prd, onClose, onUpdated }: Props) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prd.content);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [version, setVersion] = useState(prd.version || 'v1.0');
  const [content, setContent] = useState(prd.content);
  const [acceptance, setAcceptance] = useState<Record<string, boolean>>(prd.acceptance_state || {});
  const [syncingChecks, setSyncingChecks] = useState<Record<string, boolean>>({});

  useShortcuts({
    esc: () => {
      if (editing) {
        cancelEdit();
      } else if (toast) {
        setToast(null);
      }
    },
  });

  useEffect(() => {
    setContent(prd.content);
    setVersion(prd.version || 'v1.0');
    setAcceptance(prd.acceptance_state || {});
    setDraft(prd.content);
  }, [prd.prd_id, prd.content, prd.version, prd.acceptance_state]);

  useEffect(() => {
    if (!prd.prd_id) return;
    const migrated = remapAcceptanceKeys(prd.acceptance_state || {}, prd.content);
    if (migrated.changed) {
      console.info(
        `[PrdViewer] v1.1 起验收项 ID 改为按行号持久化，已迁移 ${migrated.migratedCount} 项`
      );
      setAcceptance(migrated.state);
      api.editPrdAcceptance(prd.prd_id, migrated.state).catch((e) => {
        console.warn('[PrdViewer] 自动迁移 acceptance_state 失败:', e);
      });
    }
  }, [prd.prd_id, prd.content]);

  const showToast = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 2200);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const download = async () => {
    setDownloading(true);
    try {
      const res = await api.exportPrd(prd.prd_id, 'markdown');
      const blob = new Blob([res.content], { type: res.mime_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const startEdit = () => {
    setDraft(content);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(content);
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!draft.trim()) {
      showToast('err', '内容不能为空');
      return;
    }
    if (draft === content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await api.editPrd(prd.prd_id, draft);
      setContent(res.content);
      setVersion(res.version);
      setEditing(false);
      onUpdated?.({ content: res.content, version: res.version, acceptance_state: acceptance });
      showToast('ok', `已保存 · ${res.version}`);
    } catch (e) {
      showToast('err', `保存失败：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleCheck = async (id: string, next: boolean) => {
    const prev = acceptance[id] || false;
    setAcceptance((m) => ({ ...m, [id]: next }));
    setSyncingChecks((m) => ({ ...m, [id]: true }));
    try {
      const res = await api.editPrdAcceptance(prd.prd_id, { [id]: next });
      setAcceptance(res.acceptance_state);
      onUpdated?.({ content, version, acceptance_state: res.acceptance_state });
    } catch (e) {
      setAcceptance((m) => ({ ...m, [id]: prev }));
      showToast('err', `同步失败：${(e as Error).message}`);
    } finally {
      setSyncingChecks((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
    }
  };

  return (
    <div className="p-6 relative">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--success)' }}>
            PRD {version}
          </div>
          <div className="font-display text-[20px] font-semibold tracking-tight">{prd.title}</div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <>
              <button onClick={copy} className="btn btn-ghost">
                {copied ? '已复制' : '复制 Markdown'}
              </button>
              <button onClick={download} disabled={downloading} className="btn btn-ghost">
                {downloading ? '下载中…' : '导出 .md'}
              </button>
              <button onClick={startEdit} className="btn btn-ghost" title="编辑 PRD（Esc 取消）">
                ✏️ 编辑
              </button>
              <button onClick={onClose} className="btn btn-ghost">
                返回文档
              </button>
            </>
          )}
          {editing && (
            <>
              <button onClick={cancelEdit} disabled={saving} className="btn btn-ghost">
                取消
              </button>
              <button onClick={saveEdit} disabled={saving} className="btn btn-primary">
                {saving ? '保存中…' : '保存'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="surface p-6">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            className="w-full font-mono text-[12.5px] leading-[1.7] rounded-md p-3 outline-none resize-y"
            style={{
              minHeight: '60vh',
              background: 'var(--bg-surface-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-hairline)',
            }}
            placeholder="在这里编辑 PRD（支持 Markdown）…"
          />
        ) : (
          <MarkdownView
            content={content}
            acceptance={acceptance}
            syncingChecks={syncingChecks}
            onToggle={toggleCheck}
          />
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-md text-[12.5px] shadow-md"
          style={{
            background: toast.kind === 'ok' ? 'var(--success)' : 'var(--destructive)',
            color: '#fff',
            zIndex: 60,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function MarkdownView({
  content,
  acceptance,
  syncingChecks,
  onToggle,
}: {
  content: string;
  acceptance: Record<string, boolean>;
  syncingChecks: Record<string, boolean>;
  onToggle: (id: string, next: boolean) => void;
}) {
  const lines = content.split('\n');
  const checkItems = useMemo(() => {
    const items: Array<{ id: string; text: string; lineIdx: number }> = [];
    lines.forEach((line, i) => {
      if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
        const text = line.slice(6);
        items.push({ id: stableCheckId(i), text, lineIdx: i });
      }
    });
    return items;
  }, [lines]);

  return (
    <div className="text-[13px] leading-[1.7] space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) {
          return (
            <h1 key={i} className="font-display font-semibold text-[22px] mt-4 mb-3 tracking-tight">
              {line.slice(2)}
            </h1>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h2 key={i} className="font-display font-semibold text-[16px] mt-6 mb-2 tracking-tight">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h3 key={i} className="font-display font-medium text-[14px] mt-4 mb-1">
              {line.slice(4)}
            </h3>
          );
        }
        if (line.startsWith('> ')) {
          return (
            <div
              key={i}
              className="px-3 py-1.5 my-2 italic text-[12.5px]"
              style={{
                borderLeft: '2px solid var(--accent)',
                color: 'var(--text-secondary)',
                background: 'var(--bg-surface-2)',
              }}
            >
              {line.slice(2)}
            </div>
          );
        }
        if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
          const text = line.slice(6);
          const item = checkItems.find((x) => x.lineIdx === i);
          if (!item) {
            return (
              <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span>{text}</span>
              </div>
            );
          }
          const checked = !!acceptance[item.id];
          const syncing = !!syncingChecks[item.id];
          return (
            <label
              key={i}
              className="flex items-start gap-2 ml-2 my-0.5 cursor-pointer select-none"
              style={{ opacity: syncing ? 0.6 : 1 }}
            >
              <input
                type="checkbox"
                className="mt-1 accent-[color:var(--accent)]"
                checked={checked}
                onChange={(e) => onToggle(item.id, e.target.checked)}
              />
              <span
                style={{
                  textDecoration: checked ? 'line-through' : 'none',
                  color: checked ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
              >
                {text}
              </span>
            </label>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (/^\d+\. /.test(line)) {
          return (
            <div key={i} className="ml-2 my-0.5">
              {line}
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return <p key={i} className="my-1">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function makeCheckId(text: string, idx: number): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }
  const hash = (h >>> 0).toString(36);
  return `check-${idx}-${hash}`;
}

function stableCheckId(lineIdx: number): string {
  return `check-line-${lineIdx}`;
}

function remapAcceptanceKeys(
  state: Record<string, boolean>,
  content: string,
): { state: Record<string, boolean>; changed: boolean; migratedCount: number } {
  const lines = content.split('\n');
  const result: Record<string, boolean> = {};
  let changed = false;
  let migratedCount = 0;

  Object.entries(state).forEach(([key, value]) => {
    if (key.startsWith('check-line-')) {
      result[key] = value;
      return;
    }
    const m = key.match(/^check-(\d+)-/);
    if (m) {
      const oldLineIdx = parseInt(m[1], 10);
      if (
        oldLineIdx >= 0 &&
        oldLineIdx < lines.length &&
        (lines[oldLineIdx].startsWith('- [ ] ') || lines[oldLineIdx].startsWith('- [x] '))
      ) {
        const text = lines[oldLineIdx].slice(6);
        if (makeCheckId(text, oldLineIdx) === key) {
          const newKey = stableCheckId(oldLineIdx);
          result[newKey] = value;
          changed = true;
          migratedCount++;
          return;
        }
      }
    }
    result[key] = value;
  });

  return { state: result, changed, migratedCount };
}

function renderInline(text: string) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const bold = remaining.match(/\*\*(.+?)\*\*/);
    if (bold && bold.index !== undefined) {
      if (bold.index > 0) parts.push(remaining.slice(0, bold.index));
      parts.push(<strong key={key++} className="font-semibold">{bold[1]}</strong>);
      remaining = remaining.slice(bold.index + bold[0].length);
      continue;
    }
    parts.push(remaining);
    break;
  }
  return <>{parts}</>;
}
