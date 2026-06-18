'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { Corner } from '@/components/Corner';

interface ProjectOption {
  id: string;
  name: string;
}

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetProjectId = searchParams.get('project_id');
  const [input, setInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ name: string; dataUrl: string; size: number } | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState<string>(presetProjectId || '');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const voice = useVoiceInput({
    onResult: (text) => {
      setInput((prev) => (prev ? prev + (prev.endsWith('\n') ? '' : ' ') : '') + text);
    },
  });

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    api
      .listProjects()
      .then((list) => {
        setProjects(list.map((p) => ({ id: p.id, name: p.name })));
        if (presetProjectId) {
          setProjectId(presetProjectId);
        } else if (!projectId && list.length > 0) {
          setProjectId(list[0].id);
        }
      })
      .catch(() => {});
  }, [presetProjectId]);

  useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

  const toggleVoice = voice.toggle;
  const recording = voice.recording;
  const voiceSupported = voice.supported;

  const onPickFile = () => {
    fileRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage({ name: f.name, dataUrl: String(reader.result || ''), size: f.size });
    };
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || creating) return;
    setCreating(true);
    setError(null);
    try {
      const conv = await api.startConversation(projectId || undefined);
      if (text) {
        try {
          sessionStorage.setItem(`pending_initial_${conv.conversation_id}`, text);
        } catch {}
      }
      if (pendingImage) {
        try {
          sessionStorage.setItem(`pending_image_${conv.conversation_id}`, JSON.stringify(pendingImage));
        } catch {}
      }
      const q = new URLSearchParams();
      if (text || pendingImage) q.set('auto', '1');
      router.push(`/conversation/${conv.conversation_id}${q.toString() ? `?${q.toString()}` : ''}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  const createProjectInline = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreatingProject(true);
    try {
      const p = await api.createProject(name);
      setProjects((prev) => [...prev, { id: p.id, name: p.name }]);
      setProjectId(p.id);
      setShowNewProject(false);
      setNewProjectName('');
    } catch (e) {
      setError((e as Error).message || '创建项目失败');
    } finally {
      setCreatingProject(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="min-h-[calc(100vh-48px)] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-3xl">
        <div className="flex justify-center mb-10 pt-0">
          <div className="relative inline-block" style={{ width: 480, height: 237 }}>
            <div className="gold-flow-aura" aria-hidden />
            <img
              src="/centnarr.png"
              alt="百叙成章"
              width={480}
              height={237}
              className="block relative"
              draggable={false}
              style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.25))' }}
            />
          </div>
        </div>
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5"
            style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-hairline)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
            <span className="text-[11px] tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              AI 主导 · 业务确认 · PRD 一键生成
            </span>
          </div>
          <h1 className="font-display text-[36px] font-semibold tracking-tight mb-3 leading-[1.1]">
            跟我说说你最近遇到啥问题
          </h1>
          <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
            不用准备，不用组织语言，就像跟同事聊天一样。我会一边听一边问你几个关键问题，把你的需求整理成清清楚楚的文档。
          </p>
        </div>

        <div className="lux-card p-5">
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
          <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
            <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              所属项目
            </span>
            {!showNewProject ? (
              <>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="input !py-1 !text-[12.5px] max-w-[260px]"
                  style={{ cursor: 'pointer' }}
                >
                  {projects.length === 0 && <option value="">（暂无项目）</option>}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewProject(true)}
                  className="text-[12px]"
                  style={{ color: 'var(--accent)' }}
                >
                  + 新建项目
                </button>
                {projects.length > 0 && (
                  <Link
                    href="/projects"
                    className="text-[11.5px] ml-auto"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    管理项目 →
                  </Link>
                )}
              </>
            ) : (
              <>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="新项目名"
                  className="input !py-1 !text-[12.5px] max-w-[200px]"
                  maxLength={120}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      createProjectInline();
                    } else if (e.key === 'Escape') {
                      setShowNewProject(false);
                    }
                  }}
                />
                <button
                  onClick={createProjectInline}
                  disabled={creatingProject || !newProjectName.trim()}
                  className="btn btn-primary !py-1 !px-2.5 text-[12px]"
                >
                  {creatingProject ? '创建中' : '确定'}
                </button>
                <button
                  onClick={() => {
                    setShowNewProject(false);
                    setNewProjectName('');
                  }}
                  className="btn btn-ghost !py-1 !px-2.5 text-[12px]"
                >
                  取消
                </button>
              </>
            )}
          </div>
          <div className="text-[11.5px] mb-4 italic" style={{ color: 'var(--text-muted)' }}>
            <span className="gold-text" style={{ fontWeight: 500 }}>Tip</span>
            <span className="mx-1.5" style={{ color: 'var(--border-strong)' }}>·</span>
            已经在某个项目里了？选好项目直接说，会自动归到该项目。
          </div>

          {pendingImage && (
            <div className="mb-3 flex items-center gap-3 p-2 rounded-md" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-hairline)' }}>
              <img src={pendingImage.dataUrl} alt={pendingImage.name} className="w-12 h-12 object-cover rounded" />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] truncate" style={{ color: 'var(--text-primary)' }}>
                  {pendingImage.name}
                </div>
                <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                  截图将作为补充消息发送 · {Math.round(pendingImage.size / 1024)} KB
                </div>
              </div>
              <button onClick={() => setPendingImage(null)} className="btn btn-ghost !p-1 !text-[11px]">
                移除
              </button>
            </div>
          )}

          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={`目标用户：给谁用？
使用场景：解决什么问题？
核心功能：要做哪些事？
关键约束：必须 / 不做？
验收标准：怎么算合格？`}
            rows={5}
            className="w-full bg-transparent outline-none resize-none text-[15px] leading-[1.6]"
            style={{ color: 'var(--text-primary)' }}
            disabled={creating}
          />

          <div className="divider my-3" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleVoice}
                disabled={!voiceSupported}
                title={voiceSupported ? (recording ? '点击停止录音' : '点击开始语音输入') : '当前浏览器不支持语音'}
                className={`btn btn-ghost !p-2 ${recording ? 'voice-recording' : ''}`}
                style={recording ? { color: 'var(--destructive)' } : undefined}
              >
                {recording ? (
                  <span className="voice-dot" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="3" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                )}
              </button>
              <button onClick={onPickFile} className="btn btn-ghost !p-2" title="截图上传">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="hidden"
                onChange={onFileChange}
              />
              <span className="text-[11px] ml-1" style={{ color: 'var(--text-muted)' }}>
                {input.length} / 2000
              </span>
              {recording && (
                <span className="text-[11px] ml-1 voice-pulse" style={{ color: 'var(--destructive)' }}>
                  正在录音…
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                ⌘ + ⏎ 发送
              </span>
              <button onClick={submit} disabled={(!input.trim() && !pendingImage) || creating} className="btn btn-primary">
                {creating ? '准备中…' : '开始对话'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-md text-[13px]" style={{ background: 'rgba(235,87,87,0.1)', color: 'var(--destructive)' }}>
            {error}
          </div>
        )}

        <div className="mt-10 grid grid-cols-3 gap-3">
          {[
            { t: '业务人员说大白话', d: '不需要懂需求文档结构' },
            { t: 'AI 像医生问诊', d: '主动反问关键问题' },
            { t: '文档实时生长', d: '看着自己的话变成文档' },
          ].map((c, i) => (
            <div key={i} className="surface p-4">
              <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {c.t}
              </div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                {c.d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}