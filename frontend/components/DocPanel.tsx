'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, DocView, DeltaSet } from '@/lib/api';
import { Corner } from './Corner';

interface Props {
  doc: DocView;
  completion: number;
  state: string;
  conversationId: string;
  delta: DeltaSet | null;
  currentRound: number;
  onDocUpdated: (doc: DocView, completion: number) => void;
  streamingDoc?: DocView | null;
}

type DeltaKind = 'added' | 'modified' | 'confirmed' | 'edited';
type FieldTone = 'default' | 'warning' | 'success' | 'accent';

export function DocPanel({
  doc,
  completion,
  state,
  conversationId,
  delta,
  onDocUpdated,
  streamingDoc,
}: Props) {
  const displayDoc = streamingDoc || doc;
  const isStreaming = !!streamingDoc;
  const currentSection = useMemo(() => {
    if (!displayDoc) return undefined;
    if (displayDoc.pain_points.length > 0 && displayDoc.expected_outcomes.length === 0) return 'expected_outcomes';
    if (displayDoc.roles.length > 0 && displayDoc.pain_points.length === 0) return 'pain_points';
    if (displayDoc.background && displayDoc.roles.length === 0) return 'roles';
    if (displayDoc.scene && !displayDoc.background) return 'background';
    return 'background';
  }, [displayDoc]);
  const showConfirm = state === 'confirming';
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const tagMap = useMemo(() => {
    const m = new Map<string, DeltaKind>();
    if (!delta) return m;
    const push = (key: DeltaKind) => {
      const arr = (delta as Record<string, unknown>)[key] as Array<{ field?: string }> | undefined;
      if (!Array.isArray(arr)) return;
      arr.forEach((it) => {
        if (it && typeof it.field === 'string') m.set(it.field, key);
      });
    };
    push('added');
    push('modified');
    push('confirmed');
    push('edited');
    return m;
  }, [delta]);

  const saveField = async (fieldPath: string, value: string) => {
    setSavingPath(fieldPath);
    setFieldErrors((prev) => {
      if (!(fieldPath in prev)) return prev;
      const next = { ...prev };
      delete next[fieldPath];
      return next;
    });
    try {
      const res = await api.editDoc(conversationId, fieldPath, value);
      onDocUpdated(res.doc, res.completion);
    } catch (e) {
      setFieldErrors((prev) => ({ ...prev, [fieldPath]: (e as Error).message || '保存失败' }));
    } finally {
      setSavingPath(null);
    }
  };

  return (
    <div className="lux-card p-6 pb-2 mx-4 mt-4 mb-3 relative">
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
      <div className="flex items-start justify-between mb-5">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            实时生长的文档
          </div>
          <div className="font-display text-[20px] font-semibold tracking-tight flex items-center gap-2 flex-wrap">
            <span>{displayDoc.scene || '需求草稿（等待识别）'}</span>
            <DeltaTag kind={tagMap.get('scene')} />
          </div>
        </div>
        <div className="flex-shrink-0 ml-4 self-start">
          <CompletionDots doc={displayDoc} completion={completion} />
        </div>
      </div>

      <div className="surface p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>背景</SectionTitle>
          <DeltaTag kind={tagMap.get('background')} />
        </div>
        <div className="text-[13.5px] leading-[1.7]">
          <EditableField
            value={displayDoc.background || ''}
            multiline
            onSave={(v) => saveField('background', v)}
            saving={savingPath === 'background'}
            error={fieldErrors['background']}
            placeholder="（等待业务人员描述）"
          />
        </div>
      </div>

      <div className="surface p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>涉及角色</SectionTitle>
        </div>
        {displayDoc.roles.length === 0 ? (
          <Empty>（等待识别）</Empty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {displayDoc.roles.map((r, i) => (
              <div
                key={i}
                className="px-3 py-2 rounded-md text-[12.5px] min-w-[140px]"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-hairline)' }}
              >
                <div className="font-medium mb-0.5 flex items-center gap-1">
                  <EditableField
                    value={r.name || ''}
                    onSave={(v) => saveField(`roles[${i}].name`, v)}
                    saving={savingPath === `roles[${i}].name`}
                    error={fieldErrors[`roles[${i}].name`]}
                    placeholder="（角色名）"
                  />
                  <DeltaTag kind={tagMap.get(`roles[${i}].name`)} />
                </div>
                <div className="text-[11.5px] flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                  <EditableField
                    value={r.responsibility || ''}
                    onSave={(v) => saveField(`roles[${i}].responsibility`, v)}
                    saving={savingPath === `roles[${i}].responsibility`}
                    error={fieldErrors[`roles[${i}].responsibility`]}
                    placeholder="（职责）"
                  />
                  <DeltaTag kind={tagMap.get(`roles[${i}].responsibility`)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>核心痛点</SectionTitle>
        </div>
        {displayDoc.pain_points.length === 0 ? (
          <Empty>（等待识别）</Empty>
        ) : (
          <ul className="space-y-2">
            {displayDoc.pain_points.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <span
                  className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                  style={{ background: 'var(--destructive)' }}
                />
                <div className="flex-1 min-w-0">
                  <div style={{ color: 'var(--text-primary)' }}>
                    <EditableField
                      value={p.description || ''}
                      multiline
                      onSave={(v) => saveField(`pain_points[${i}].description`, v)}
                      saving={savingPath === `pain_points[${i}].description`}
                      error={fieldErrors[`pain_points[${i}].description`]}
                      placeholder="（痛点描述）"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <EditableField
                      value={p.frequency || ''}
                      compact
                      onSave={(v) => saveField(`pain_points[${i}].frequency`, v)}
                      saving={savingPath === `pain_points[${i}].frequency`}
                      error={fieldErrors[`pain_points[${i}].frequency`]}
                      placeholder="频次"
                    />
                    <EditableField
                      value={p.severity || ''}
                      compact
                      tone="warning"
                      onSave={(v) => saveField(`pain_points[${i}].severity`, v)}
                      saving={savingPath === `pain_points[${i}].severity`}
                      error={fieldErrors[`pain_points[${i}].severity`]}
                      placeholder="严重度"
                    />
                    <DeltaTag kind={tagMap.get(`pain_points[${i}].description`)} />
                    <DeltaTag kind={tagMap.get(`pain_points[${i}].frequency`)} />
                    <DeltaTag kind={tagMap.get(`pain_points[${i}].severity`)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>期望效果</SectionTitle>
        </div>
        {displayDoc.expected_outcomes.length === 0 ? (
          <Empty>（等待识别）</Empty>
        ) : (
          <ul className="space-y-1.5">
            {displayDoc.expected_outcomes.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <span
                  className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                  style={{ background: 'var(--success)' }}
                />
                <div className="flex-1 min-w-0">
                  <span style={{ color: 'var(--text-primary)' }}>
                    <EditableField
                      value={e.description || ''}
                      multiline
                      onSave={(v) => saveField(`expected_outcomes[${i}].description`, v)}
                      saving={savingPath === `expected_outcomes[${i}].description`}
                      error={fieldErrors[`expected_outcomes[${i}].description`]}
                      placeholder="（期望效果）"
                    />
                  </span>
                  {e.explicit === false && (
                    <span className="tag tag-warning ml-2">⚠ 待确认</span>
                  )}
                  <DeltaTag kind={tagMap.get(`expected_outcomes[${i}].description`)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {displayDoc.key_scenarios.length > 0 && (
        <div className="surface p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>关键场景</SectionTitle>
          </div>
          <ul className="space-y-2">
            {displayDoc.key_scenarios.map((s, i) => (
              <li key={i} className="text-[13px]">
                <div style={{ color: 'var(--text-primary)' }}>
                  <EditableField
                    value={s.description || ''}
                    multiline
                    onSave={(v) => saveField(`key_scenarios[${i}].description`, v)}
                    saving={savingPath === `key_scenarios[${i}].description`}
                    error={fieldErrors[`key_scenarios[${i}].description`]}
                    placeholder="（场景描述）"
                  />
                  <DeltaTag kind={tagMap.get(`key_scenarios[${i}].description`)} />
                </div>
                <div
                  className="text-[12px] mt-0.5 italic"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  例：
                  <EditableField
                    value={s.example || ''}
                    multiline
                    onSave={(v) => saveField(`key_scenarios[${i}].example`, v)}
                    saving={savingPath === `key_scenarios[${i}].example`}
                    error={fieldErrors[`key_scenarios[${i}].example`]}
                    placeholder="（举例）"
                  />
                  <DeltaTag kind={tagMap.get(`key_scenarios[${i}].example`)} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {displayDoc.to_confirm.length > 0 && (
        <div className="surface p-5" style={{ borderColor: 'rgba(242,201,76,0.25)' }}>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>
              <span style={{ color: 'var(--warning)' }}>⚠ 待确认</span>
            </SectionTitle>
            <DeltaTag kind={tagMap.get('to_confirm')} />
          </div>
          <ul className="space-y-1.5">
            {displayDoc.to_confirm.map((t, i) => (
              <li key={i} className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                · {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showConfirm && (
        <div
          className="surface p-4 mt-4 flex items-center justify-between"
          style={{ borderColor: 'var(--success)' }}
        >
          <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            这份业务确认稿看起来差不多了。
          </div>
          <span className="tag tag-success">可签收</span>
        </div>
      )}

      {isStreaming && (
        <DocSkeletonOverlay activeSection={currentSection} />
      )}
    </div>
  );
}

function DocSkeletonOverlay({ activeSection }: { activeSection?: string }) {
  const sections = [
    { id: 'background', label: '背景' },
    { id: 'roles', label: '涉及角色' },
    { id: 'pain_points', label: '核心痛点' },
    { id: 'expected_outcomes', label: '期望效果' },
    { id: 'key_scenarios', label: '关键场景' },
    { id: 'to_confirm', label: '待确认' },
  ];
  return (
    <div className="surface p-5 mb-4 mt-4" style={{ borderColor: 'var(--accent)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: 'var(--accent)' }}
        />
        <div
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          AI 正在整理章节…
        </div>
      </div>
      <div className="space-y-2">
        {sections.map((s) => {
          const isActive = activeSection === s.id;
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 px-3 py-2 rounded-md transition-opacity"
              style={{
                background: isActive ? 'rgba(94,106,210,0.12)' : 'var(--bg-surface-2)',
                opacity: isActive ? 1 : 0.5,
              }}
            >
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                style={{
                  background: isActive ? 'var(--accent)' : 'var(--bg-surface-3)',
                  color: isActive ? 'var(--accent-fg)' : 'var(--text-muted)',
                }}
              >
                {isActive ? '✍' : '○'}
              </span>
              <span className="text-[12.5px]" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {s.label}
              </span>
              {isActive && (
                <span className="ml-auto text-[10.5px]" style={{ color: 'var(--accent)' }}>
                  正在填…
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] uppercase tracking-wider"
      style={{ color: 'var(--text-muted)', fontWeight: 600 }}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
      {children}
    </div>
  );
}

function CompletionDots({ doc, completion }: { doc: DocView; completion: number }) {
  const fields: Array<{ key: keyof DocView | string; label: string; filled: boolean; weight: number }> = [
    { key: 'scene', label: '场景', filled: !!doc.scene?.trim(), weight: 20 },
    { key: 'background', label: '背景', filled: !!doc.background?.trim(), weight: 15 },
    { key: 'roles', label: '角色', filled: doc.roles?.some((r) => r.name?.trim()) ?? false, weight: 15 },
    { key: 'pain_points', label: '痛点', filled: doc.pain_points?.some((p) => p.description?.trim()) ?? false, weight: 15 },
    { key: 'expected_outcomes', label: '期望', filled: doc.expected_outcomes?.some((e) => e.description?.trim()) ?? false, weight: 20 },
    { key: 'key_scenarios', label: '场景示例', filled: doc.key_scenarios?.some((s) => s.description?.trim()) ?? false, weight: 15 },
  ];
  const filledCount = fields.filter((f) => f.filled).length;
  const totalCount = fields.length;
  const weighted = fields.reduce((sum, f) => sum + (f.filled ? f.weight : 0), 0);
  const allFilled = filledCount === totalCount;
  return (
    <div className="flex flex-col items-end gap-1.5" title={`完成度基于 6 个字段加权: ${weighted}/100`}>
      <div className="flex items-center gap-1.5">
        {fields.map((f) => (
          <span
            key={String(f.key)}
            title={`${f.label}${f.filled ? ' ✓' : ' (待补)'}`}
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: f.filled ? 'var(--gold)' : 'transparent',
              border: f.filled ? '1px solid var(--gold)' : '1px solid var(--border-strong)',
              transition: 'all 220ms ease-out',
              boxShadow: f.filled ? '0 0 6px var(--gold-glow)' : 'none',
            }}
          />
        ))}
      </div>
      <div className="text-[10.5px] tracking-wide" style={{ color: allFilled ? 'var(--gold)' : 'var(--text-muted)' }}>
        完成度 {filledCount}/{totalCount}
      </div>
    </div>
  );
}

function DeltaTag({ kind }: { kind?: DeltaKind }) {
  if (!kind) return null;
  if (kind === 'added') return <span className="tag tag-accent">✨新</span>;
  if (kind === 'modified') return <span className="tag tag-warning">🔄改</span>;
  if (kind === 'confirmed') return <span className="tag tag-success">✓确认</span>;
  if (kind === 'edited') return <span className="tag tag-accent">✏️编辑</span>;
  return null;
}

interface EditableFieldProps {
  value: string;
  multiline?: boolean;
  compact?: boolean;
  tone?: FieldTone;
  onSave: (newValue: string) => Promise<void> | void;
  saving: boolean;
  error?: string;
  placeholder?: string;
}

function EditableField({
  value,
  multiline = false,
  compact = false,
  tone = 'default',
  onSave,
  saving,
  error,
  placeholder,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        try {
          inputRef.current?.focus();
          if (inputRef.current && 'select' in inputRef.current) {
            (inputRef.current as HTMLInputElement).select();
          }
        } catch {
          // ignore
        }
      }, 0);
      return () => clearTimeout(t);
    }
    return;
  }, [editing]);

  const startEdit = () => {
    if (saving) return;
    setDraft(value);
    setEditing(true);
  };

  const doSave = async () => {
    if (saving) return;
    if (draft === value) {
      setEditing(false);
      return;
    }
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // 错误由父组件透传展示
    }
  };

  const doCancel = () => {
    cancelledRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  const handleBlur = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    void doSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      doCancel();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void doSave();
      return;
    }
  };

  if (saving && !editing) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px]"
        style={{ color: 'var(--text-muted)' }}
      >
        保存中…
      </span>
    );
  }

  if (editing) {
    const commonProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      autoFocus: true,
    };
    return (
      <span className="block w-full">
        {multiline ? (
          <textarea
            {...commonProps}
            ref={(el) => {
              inputRef.current = el;
            }}
            rows={Math.max(2, draft.split('\n').length)}
            className={`input resize-y w-full ${compact ? 'text-[12px]' : ''}`}
            placeholder={placeholder}
          />
        ) : (
          <input
            {...commonProps}
            ref={(el) => {
              inputRef.current = el;
            }}
            className={`input ${compact ? 'text-[11.5px] py-1 px-2' : ''}`}
            placeholder={placeholder}
          />
        )}
        {error && (
          <div
            className="text-[11px] mt-1"
            style={{ color: 'var(--destructive)' }}
          >
            {error}
          </div>
        )}
        {multiline && !compact && (
          <div
            className="text-[10.5px] mt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            ⌘/Ctrl + Enter 保存 · Esc 取消
          </div>
        )}
      </span>
    );
  }

  const displayEmpty = !value;
  const toneClass =
    tone === 'warning'
      ? 'tag-warning'
      : tone === 'success'
      ? 'tag-success'
      : tone === 'accent'
      ? 'tag-accent'
      : '';

  return (
    <span
      className={
        compact
          ? 'group inline-flex items-center gap-1 align-middle'
          : 'group inline-flex items-start gap-1.5 align-baseline w-full'
      }
    >
      <span
        className={compact ? `tag ${toneClass}` : multiline ? 'whitespace-pre-wrap flex-1' : 'flex-1'}
        style={{
          color: displayEmpty ? 'var(--text-muted)' : 'var(--text-primary)',
          fontStyle: displayEmpty ? 'italic' : 'normal',
        }}
      >
        {value || placeholder || '（未填写）'}
      </span>
      <button
        type="button"
        onClick={startEdit}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[12px] flex-shrink-0 leading-none"
        style={{
          color: 'var(--text-muted)',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
        title="编辑（失焦或 ⌘+Enter 保存，Esc 取消）"
        aria-label="编辑"
      >
        ✏️
      </button>
    </span>
  );
}
