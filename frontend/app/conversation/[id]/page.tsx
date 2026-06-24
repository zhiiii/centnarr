'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ConversationView, DocView, QuestionItem, DeltaSet, StreamEvent } from '@/lib/api';
import { DocPanel } from '@/components/DocPanel';
import { CommunicationTimeline } from '@/components/CommunicationTimeline';
import { PrdViewer } from '@/components/PrdViewer';
import { QuestionsCard } from '@/components/QuestionsCard';
import { sanitizeAiText } from '@/lib/ai_text';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useTypewriter } from '@/hooks/useTypewriter';

const STREAM_TIMEOUT_MS = 90_000;

function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const msg = (e as Error).message || String(e);
  return /fetch failed|networkerror|timeout|aborted/i.test(msg);
}

interface PendingPrd {
  prd_id: string;
  title: string;
  content: string;
  version: string;
}

interface PendingImage {
  file_id: string;
  file_url: string;
  file_type: string;
  name: string;
  dataUrl: string;
  size: number;
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { blob: new Blob(), ext: 'png' };
  const mime = m[1];
  const bin = atob(m[2]);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  const ext = mime.split('/')[1] || 'png';
  return { blob: new Blob([arr], { type: mime }), ext };
}

function isChatLog(text: string): boolean {
  if (!text) return false;
  const lines = text.split(/\r?\n/);
  let hits = 0;
  const re = /(^|\s)([01]?\d|2[0-3]):([0-5]\d)(\s|$)/;
  for (const l of lines) {
    if (re.test(l)) hits++;
  }
  return hits >= 3;
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoFlag = searchParams.get('auto') === '1';

  const [conv, setConv] = useState<ConversationView | null>(null);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prd, setPrd] = useState<PendingPrd | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [inputType, setInputType] = useState<'text' | 'file'>('text');
  const [dragOver, setDragOver] = useState(false);
  const [streaming, setStreaming] = useState<{ content: string; error: string | null } | null>(null);
  const [streamState, setStreamState] = useState<string | null>(null);
  const [streamSubState, setStreamSubState] = useState<'idle' | 'answering' | 'integrating' | 'writing' | 'done'>('idle');
  const [streamingQuestions, setStreamingQuestions] = useState<QuestionItem[]>([]);
  const [streamingEmotionalCare, setStreamingEmotionalCare] = useState<string | null>(null);
  const [streamingSummary, setStreamingSummary] = useState<string | null>(null);
  const [streamingDoc, setStreamingDoc] = useState<DocView | null>(null);
  const [streamingCompletion, setStreamingCompletion] = useState<number | null>(null);
  const [silentRetried, setSilentRetried] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const lastSubmitRef = useRef<{
    text: string;
    isFirst: boolean;
    options: { input_type?: string; meta?: Record<string, unknown> };
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initialSentRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceInput({
    onResult: (text) => {
      setInput((prev) => (prev ? prev + (prev.endsWith('\n') ? '' : ' ') : '') + text);
    },
  });

  useEffect(() => {
    api
      .getConversation(id)
      .then(setConv)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

  const recording = voice.recording;
  const voiceSupported = voice.supported;
  const toggleVoice = voice.toggle;

  useEffect(() => {
    return () => {
      try {
        abortRef.current?.abort();
      } catch {}
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        abortRef.current?.abort();
      } catch {}
    };
  }, [id]);

  const uploadAndAddImage = useCallback(
    async (blob: Blob, filename: string): Promise<PendingImage | null> => {
      try {
        setUploading(true);
        const res = await api.uploadFile(id, blob, filename);
        const dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.readAsDataURL(blob);
        });
        const img: PendingImage = {
          file_id: res.file_id,
          file_url: res.file_url,
          file_type: res.file_type,
          name: filename,
          dataUrl,
          size: blob.size,
        };
        setPendingImages((prev) => [...prev, img]);
        return img;
      } catch (e) {
        setError(`上传失败：${(e as Error).message}`);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (!conv || initialSentRef.current) return;
    if (conv.state === 'idle') {
      if (!autoFlag) {
        initialSentRef.current = true;
        return;
      }
      initialSentRef.current = true;
      const runInitial = async () => {
        const pendingTextKey = `pending_initial_${id}`;
        const pendingImageKey = `pending_image_${id}`;
        let pendingText = '';
        try {
          pendingText = sessionStorage.getItem(pendingTextKey) || '';
          if (pendingText) sessionStorage.removeItem(pendingTextKey);
        } catch {}
        if (pendingText) {
          await runStream(pendingText, true);
        }
        try {
          const raw = sessionStorage.getItem(pendingImageKey);
          if (raw) {
            sessionStorage.removeItem(pendingImageKey);
            const parsed = JSON.parse(raw) as { name: string; dataUrl: string; size: number };
            const { blob, ext } = dataUrlToBlob(parsed.dataUrl);
            const filename = parsed.name || `screenshot.${ext}`;
            const res = await api.uploadFile(id, blob, filename);
            setPendingImages([
              {
                file_id: res.file_id,
                file_url: res.file_url,
                file_type: res.file_type,
                name: filename,
                dataUrl: parsed.dataUrl,
                size: res.size,
              },
            ]);
            await runStream(`[image] ${filename}`, false, { input_type: 'file', meta: { file_id: res.file_id, file_url: res.file_url, file_type: res.file_type, size: res.size } });
          }
        } catch (e) {
          setError(`补充图片失败：${(e as Error).message}`);
        }
      };
      void runInitial();
    } else {
      initialSentRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv, autoFlag]);

  const runStream = async (
    text: string,
    isFirst = false,
    options: { input_type?: string; meta?: Record<string, unknown> } = {},
    silentRetry = false,
  ) => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutSignal = AbortSignal.timeout(STREAM_TIMEOUT_MS);
    const combined = AbortSignal.any([controller.signal, timeoutSignal]);

    lastSubmitRef.current = { text, isFirst, options };
    if (!silentRetry) {
      setSilentRetried(false);
      setPending(true);
      setError(null);
    }
    setStreaming({ content: '', error: null });
    setStreamSubState('answering');
    setStreamingQuestions([]);
    setStreamingEmotionalCare(null);
    setStreamingSummary(null);
    setStreamingDoc(null);
    setStreamingCompletion(null);

    const isAsync = !isFirst && /^(我想补充|补充一下|补一句|对了|还有|另外)/.test(text.trim());
    const stream = isFirst
      ? api.streamFirstMessage(id, text, options, combined)
      : api.streamRespond(id, text, isAsync, options, combined);

    let sawErrorEvent = false;
    let transportError: unknown = null;

    try {
      for await (const ev of stream) {
        if (ev.type === 'state' && typeof ev.state === 'string') {
          setStreamState(ev.state);
          if (ev.state === 'integrating') setStreamSubState('integrating');
          else if (ev.state === 'asking') setStreamSubState('done');
          else if (ev.state === 'answering') setStreamSubState('answering');
        } else if (ev.type === 'delta' && typeof ev.content === 'string') {
          setStreamSubState('writing');
          setStreaming((prev) => (prev ? { ...prev, content: prev.content + ev.content } : prev));
        } else if (ev.type === 'summary' && typeof ev.text === 'string') {
          setStreamingSummary(ev.text);
        } else if (ev.type === 'questions') {
          setStreamingQuestions(ev.questions ?? []);
        } else if (ev.type === 'integration') {
          if (ev.updated_doc) {
            setStreamingDoc(ev.updated_doc as DocView);
          }
          if (typeof ev.completion_percentage === 'number') {
            setStreamingCompletion(ev.completion_percentage);
          }
        } else if (ev.type === 'error') {
          sawErrorEvent = true;
          setStreaming((prev) =>
            prev ? { ...prev, error: ev.message || '未知错误' } : prev,
          );
        } else if (ev.type === 'done') {
          setStreaming(null);
          setStreamState(null);
          setStreamSubState('idle');
          setStreamingDoc(null);
          setStreamingCompletion(null);
          setStreamingSummary(null);
          try {
            const refreshed = await api.getConversation(id);
            setConv(refreshed);
          } catch (e) {
            setError(`刷新失败：${(e as Error).message}`);
          }
        }
      }
    } catch (e) {
      transportError = e;
      if (isNetworkError(e)) {
        setStreaming((prev) =>
          prev ? { ...prev, error: (e as Error).message || '网络错误' } : prev,
        );
      } else if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') {
        const msg =
          (e as Error).name === 'TimeoutError'
            ? `AI 想得有点久（>${STREAM_TIMEOUT_MS / 1000}s），已经自动取消`
            : '已取消当前响应';
        setStreaming((prev) => (prev ? { ...prev, error: msg } : prev));
      } else {
        setStreaming((prev) =>
          prev ? { ...prev, error: (e as Error).message } : prev,
        );
      }
    } finally {
      const abortedByClient = controller.signal.aborted || (transportError as { name?: string })?.name === 'AbortError';
      const timedOut = (transportError as { name?: string })?.name === 'TimeoutError' || timeoutSignal.aborted;
      const networkFailed = !sawErrorEvent && transportError && isNetworkError(transportError);

      if (!silentRetry && networkFailed && !abortedByClient && !timedOut) {
        setSilentRetried(true);
        void runStream(text, isFirst, options, true);
        return;
      }

      setPending(false);
      if (!silentRetry && !abortedByClient) {
        setInput('');
      }
    }
  };

  const retryLast = () => {
    const last = lastSubmitRef.current;
    if (!last) return;
    void runStream(last.text, last.isFirst, last.options);
  };

  const onFinish = async () => {
    if (!conv || pending || finishing) return;
    setFinishing(true);
    setError(null);
    try {
      await api.finishConversation(id);
      const refreshed = await api.getConversation(id);
      setConv(refreshed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFinishing(false);
    }
  };

  const onPickFile = () => {
    fileRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('仅支持图片文件');
      return;
    }
    await uploadAndAddImage(f, f.name);
  };

  const onSubmit = async () => {
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || pending || !conv) return;

    setInput('');
    if (pendingImages.length > 0) {
      const firstImg = pendingImages[0];
      const submitText = text || `[image] ${firstImg.name}`;
      const options = {
        input_type: 'file' as const,
        meta: {
          file_id: firstImg.file_id,
          file_url: firstImg.file_url,
          file_type: firstImg.file_type,
          size: firstImg.size,
        },
      };
      setPendingImages([]);
      setInputType('text');
      await runStream(submitText, false, options);
      return;
    }

    void runStream(text, false, { input_type: inputType });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void onSubmit();
    }
  };

  const onConfirm = async () => {
    if (!conv || pending) return;
    setPending(true);
    setError(null);
    try {
      await api.confirm(id);
      const refreshed = await api.getConversation(id);
      setConv(refreshed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const onGeneratePrd = async () => {
    if (!conv || pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await api.generatePrd(id);
      setPrd({ prd_id: r.prd_id, title: r.title, content: r.content, version: r.version });
      const refreshed = await api.getConversation(id);
      setConv(refreshed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        e.preventDefault();
        const blob = it.getAsFile();
        if (blob) {
          const name = `paste-${Date.now()}.${(it.type.split('/')[1] || 'png')}`;
          await uploadAndAddImage(blob, name);
        }
        return;
      }
    }
    const pastedText = e.clipboardData.getData('text/plain');
    if (pastedText && isChatLog(pastedText)) {
      setInputType('file');
    } else if (pastedText) {
      setInputType('text');
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith('image/')) {
        await uploadAndAddImage(f, f.name);
      } else {
        setError(`不支持的文件类型：${f.type || f.name}`);
      }
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types?.includes('Files')) setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const lastAssistant = useMemo(() => {
    if (!conv) return null;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'assistant') return conv.messages[i];
    }
    return null;
  }, [conv]);

  const latestQuestions = useMemo<QuestionItem[]>(() => {
    const meta = (lastAssistant?.meta || {}) as { questions?: QuestionItem[] };
    return meta.questions || [];
  }, [lastAssistant]);

  const latestDelta = useMemo<DeltaSet | null>(() => {
    if (!conv || conv.communication_cards.length === 0) return null;
    const matched = conv.communication_cards.find((c) => c.round === conv.current_round);
    const card = matched || conv.communication_cards[conv.communication_cards.length - 1];
    return (card?.delta as DeltaSet) || null;
  }, [conv]);

  const onDocUpdated = (newDoc: DocView, newCompletion: number) => {
    setConv((prev) => (prev ? { ...prev, doc: newDoc, completion: newCompletion } : prev));
  };

  if (!conv && !error) {
    return (
      <div className="min-h-[calc(100vh-48px)] flex items-center justify-center text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        加载中…
      </div>
    );
  }

  if (error && !conv) {
    return (
      <div className="min-h-[calc(100vh-48px)] flex items-center justify-center">
        <div className="surface p-6 max-w-md">
          <div className="text-[14px] font-medium mb-2" style={{ color: 'var(--destructive)' }}>
            加载失败
          </div>
          <div className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            {error}
          </div>
          <button onClick={() => router.push('/')} className="btn btn-ghost">
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (!conv) return null;

  return (
    <div className="flex" style={{ height: 'calc(100vh - 48px)' }}>
      {/* LEFT: Conversation */}
      <div
        ref={containerRef}
        className="flex flex-col w-[42%] min-w-[420px] border-r relative"
        style={{ borderColor: 'var(--border-hairline)' }}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {dragOver && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(94,106,210,0.08)', border: '2px dashed var(--accent)' }}
          >
            <div
              className="px-4 py-2 rounded-md text-[13px]"
              style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
            >
              松开上传图片
            </div>
          </div>
        )}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: stateColor(conv.state) }} />
            <span className="font-display font-medium text-[14px] truncate">
              {conv.title || '新需求'}
            </span>
            {conv.has_prd && (
              <span className="tag tag-success ml-1">PRD 已生成</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {conv.has_prd && conv.requirement_id && (
              <Link
                href={`/requirement/${conv.requirement_id}`}
                className="text-[12px]"
                style={{ color: 'var(--accent)' }}
              >
                回到需求详情 →
              </Link>
            )}
            <span className="mono text-[11px] flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              {stateLabel(conv.state)}
              {streamSubState !== 'idle' && (
                <span style={{ color: 'var(--accent)' }}>
                  · {streamSubStateLabel(streamSubState)}
                </span>
              )}
              {silentRetried && (
                <span style={{ color: 'var(--text-muted)' }}>(网络抖动，自动重试 1 次)</span>
              )}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
          {conv.messages.length === 0 && (
            <div className="text-center text-[12px] py-10" style={{ color: 'var(--text-muted)' }}>
              {conv.state === 'idle' ? '准备中…' : '对话准备就绪'}
            </div>
          )}
          {conv.messages.map((m, idx) => (
            <MessageBubble key={idx} message={m} />
          ))}

          {streaming && (
            <StreamingBubble
              content={sanitizeAiText(streaming.content)}
              error={streaming.error}
              onRetry={retryLast}
              subState={streamSubState}
              summary={sanitizeAiText(streamingSummary)}
            />
          )}

          {streamingQuestions.length > 0 && (
            <StaggeredQuestions questions={streamingQuestions} />
          )}

          {streamingQuestions.length === 0 && latestQuestions.length > 0 && conv.state !== 'confirming' && !streaming && (
            <QuestionsCard questions={latestQuestions} />
          )}

          {pending && streamSubState === 'idle' && (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              <span className="typing-cursor">AI 正在整理</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-hairline)' }}>
          {conv.has_prd ? (
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                该需求已生成 PRD，对话已封存。如需调整，请到需求详情页修改。
              </div>
              {conv.requirement_id && (
                <Link href={`/requirement/${conv.requirement_id}`} className="btn btn-primary">
                  查看 PRD
                </Link>
              )}
            </div>
          ) : conv.state === 'confirming' ? (
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                完成度 {conv.completion}% · 业务确认稿可以签收
              </div>
              <div className="flex gap-2">
                <button onClick={onConfirm} disabled={pending} className="btn btn-ghost">
                  确认稿 OK
                </button>
                <button onClick={onGeneratePrd} disabled={pending} className="btn btn-primary">
                  生成 PRD →
                </button>
              </div>
            </div>
          ) : (
            <>
              {pendingImages.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingImages.map((img) => (
                    <div
                      key={img.file_id}
                      className="flex items-center gap-2 p-1.5 rounded-md"
                      style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-hairline)' }}
                    >
                      <img src={img.dataUrl} alt={img.name} className="w-8 h-8 object-cover rounded" />
                      <span className="text-[11px] truncate max-w-[120px]" style={{ color: 'var(--text-secondary)' }}>
                        {img.name}
                      </span>
                      <button
                        onClick={() => setPendingImages((prev) => prev.filter((x) => x.file_id !== img.file_id))}
                        className="text-[10.5px] px-1"
                        style={{ color: 'var(--text-muted)' }}
                        title="移除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                className="composer-shell flex flex-col gap-2"
                style={{
                  background: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 10,
                  padding: '10px 10px 6px',
                  transition: 'border-color 150ms ease-out',
                }}
              >
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (inputType === 'file' && !isChatLog(e.target.value)) {
                      setInputType('text');
                    }
                  }}
                  onKeyDown={onKey}
                  placeholder="用大白话继续说，或者回答问题…  · 也可直接粘贴图片/聊天记录"
                  rows={3}
                  disabled={pending || conv.state === 'idle'}
                  className="composer-textarea"
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    lineHeight: 1.55,
                    padding: '2px 2px',
                    minHeight: 56,
                  }}
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={toggleVoice}
                      disabled={!voiceSupported}
                      title={voiceSupported ? (recording ? '点击停止录音' : '点击开始语音输入') : '当前浏览器不支持语音'}
                      style={{
                        width: 28,
                        height: 28,
                        padding: 0,
                        borderRadius: 7,
                        background: recording ? 'rgba(220, 80, 80, 0.12)' : 'var(--bg-surface-2)',
                        border: `1px solid ${recording ? 'rgba(220, 80, 80, 0.4)' : 'var(--border-hairline)'}`,
                        color: recording ? 'var(--destructive)' : 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 150ms ease-out',
                      }}
                    >
                      {recording ? (
                        <span className="voice-dot" />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="3" width="6" height="12" rx="3" />
                          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={onPickFile}
                      disabled={uploading}
                      title="上传图片"
                      style={{
                        width: 28,
                        height: 28,
                        padding: 0,
                        borderRadius: 7,
                        background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border-hairline)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 150ms ease-out',
                        position: 'relative',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      {pendingImages.length > 0 && (
                        <span
                          style={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            minWidth: 14,
                            height: 14,
                            padding: '0 3px',
                            borderRadius: 999,
                            background: 'var(--accent)',
                            color: 'var(--accent-fg)',
                            fontSize: 9,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            lineHeight: 1,
                          }}
                        >
                          {pendingImages.length}
                        </span>
                      )}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif"
                      className="hidden"
                      onChange={onFileChange}
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={onSubmit}
                      disabled={pending || (!input.trim() && pendingImages.length === 0) || conv.state === 'idle'}
                      title={pending ? '处理中' : '发送 (⌘+⏎)'}
                      aria-label="发送"
                      style={{
                        width: 28,
                        height: 28,
                        padding: 0,
                        borderRadius: 7,
                        background: pending
                          ? 'var(--bg-surface-3)'
                          : 'rgba(94, 106, 210, 0.18)',
                        border: '1px solid rgba(94, 106, 210, 0.28)',
                        color: pending ? 'var(--text-muted)' : 'var(--accent)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: pending ? 'wait' : 'pointer',
                        transition: 'all 150ms ease-out',
                      }}
                      onMouseEnter={(e) => {
                        if (!pending) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(94, 106, 210, 0.28)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!pending) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(94, 106, 210, 0.18)';
                        }
                      }}
                    >
                      {pending ? (
                        <span className="voice-dot" style={{ background: 'currentColor' }} />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={onFinish}
                      disabled={finishing || pending || conv.state === 'confirming'}
                      title={conv.state === 'confirming' ? '已结束对话' : '点击结束对话，进入签收'}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
                      style={{
                        color: 'var(--text-secondary)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        opacity: 1,
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      {conv.state === 'confirming'
                        ? '已聊完'
                        : finishing
                        ? '处理中…'
                        : '我聊够了'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          {error && (
            <div className="mt-2 text-[11.5px]" style={{ color: 'var(--destructive)' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Document + Timeline */}
      <div className="flex-1 overflow-y-auto">
        {prd ? (
          <PrdViewer prd={prd} />
        ) : (
          <>
            <DocPanel
              doc={conv.doc}
              completion={streamingCompletion ?? conv.completion}
              state={conv.state}
              conversationId={conv.conversation_id}
              delta={latestDelta}
              currentRound={conv.current_round}
              onDocUpdated={onDocUpdated}
              streamingDoc={streamingDoc}
            />
            <CommunicationTimeline cards={conv.communication_cards} />
          </>
        )}
      </div>
    </div>
  );
}

function stateColor(state: string): string {
  if (state === 'idle') return 'var(--text-muted)';
  if (state === 'completed') return 'var(--success)';
  if (state === 'confirming') return 'var(--warning)';
  return 'var(--accent)';
}

function stateLabel(state: string): string {
  const m: Record<string, string> = {
    idle: '待开始',
    scene_identifying: '识别场景',
    asking: 'AI 反问',
    answering: '业务回复',
    integrating: '整合信息',
    confirming: '待签收',
    prd_generating: '生成 PRD',
    completed: '已完成',
  };
  return m[state] || state;
}

function streamSubStateLabel(s: string): string {
  const m: Record<string, string> = {
    answering: 'AI 在想...',
    integrating: 'AI 正在整理...',
    writing: 'AI 在写...',
    done: '',
  };
  return m[s] || s;
}

function MessageBubble({
  message,
}: {
  message: { role: string; content: string; input_type?: string; meta?: Record<string, unknown> | null; created_at: string };
}) {
  const isUser = message.role === 'user';
  const meta = (message.meta || {}) as { file_id?: string; file_url?: string; file_type?: string };
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-medium flex-shrink-0"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          AI
        </div>
      )}
      <div
        className="max-w-[80%] px-4 py-2.5 rounded-lg text-[13.5px] leading-[1.6] whitespace-pre-wrap"
        style={{
          background: isUser ? 'var(--bg-surface-3)' : 'var(--bg-surface-1)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-hairline)',
        }}
      >
        {meta.file_url && meta.file_type?.startsWith('image/') ? (
          <img
            src={`${process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8001'}${meta.file_url}`}
            alt={meta.file_id}
            className="max-w-[200px] rounded mb-1.5"
          />
        ) : null}
        {isUser ? message.content : sanitizeAiText(message.content)}
        {message.input_type && message.input_type !== 'text' && (
          <div className="mt-1">
            <span className="tag">{message.input_type}</span>
          </div>
        )}
      </div>
      {isUser && (
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-medium flex-shrink-0"
          style={{ background: 'var(--bg-surface-3)', color: 'var(--text-secondary)' }}
        >
          我
        </div>
      )}
    </div>
  );
}

function StreamingBubble({
  content,
  error,
  onRetry,
  subState,
  summary,
}: {
  content: string;
  error: string | null;
  onRetry: () => void;
  subState?: string;
  summary?: string | null;
}) {
  const typedContent = useTypewriter(content, 22);
  const typedSummary = useTypewriter(summary ?? '', 22);
  return (
    <div className="flex gap-3 justify-start">
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-medium flex-shrink-0"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
      >
        AI
      </div>
      <div
        className="max-w-[80%] px-4 py-2.5 rounded-lg text-[13.5px] leading-[1.6] whitespace-pre-wrap"
        style={{
          background: 'var(--bg-surface-1)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-hairline)',
        }}
      >
        {error ? (
          <div>
            <div className="text-[12.5px] mb-2" style={{ color: 'var(--destructive)' }}>
              ⚠ {error}
            </div>
            <button
              onClick={onRetry}
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              AI 没想明白，重试一下？
            </button>
          </div>
        ) : (
          <div>
            {!typedContent && !typedSummary && subState && subState !== 'done' && (
              <div className="text-[12.5px] flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <span className="typing-cursor">▍</span>
                <span>{streamSubStateLabel(subState)}</span>
              </div>
            )}
            {typedSummary && (
              <div>
                {typedSummary}
                {typedContent && (
                  <>
                    {'\n\n'}
                    <span>
                      {typedContent}
                      <span className="typing-cursor" style={{ marginLeft: 2 }}>▍</span>
                    </span>
                  </>
                )}
              </div>
            )}
            {!typedSummary && typedContent && (
              <span>
                {typedContent}
                <span className="typing-cursor" style={{ marginLeft: 2 }}>▍</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StaggeredQuestions({ questions }: { questions: QuestionItem[] }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const firstShownRef = useRef(false);

  useEffect(() => {
    firstShownRef.current = false;
    if (questions.length === 0) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        setVisibleCount(1);
        firstShownRef.current = true;
      }, 80)
    );
    for (let i = 1; i < questions.length; i++) {
      timers.push(setTimeout(() => setVisibleCount(i + 1), 80 + i * 450));
    }
    return () => timers.forEach(clearTimeout);
  }, [questions]);

  if (visibleCount === 0) return null;
  return <QuestionsCard questions={questions.slice(0, visibleCount)} />;
}
