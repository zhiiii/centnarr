'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionLike {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
        resultIndex: number;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseVoiceInputOptions {
  lang?: string;
  continuous?: boolean;
  /** 录音结束时把累积的文本送给这个回调 */
  onResult?: (text: string) => void;
}

export interface UseVoiceInputResult {
  recording: boolean;
  supported: boolean;
  error: string | null;
  /** 启动或停止录音(开关)。失败时把 message 写到 error。 */
  toggle: () => void;
  /** 主动停止(不带 toggle)。 */
  stop: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputResult {
  const { lang = 'zh-CN', continuous = true, onResult } = options;
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef<((text: string) => void) | undefined>(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setRecording(false);
  }, []);

  const toggle = useCallback(() => {
    setError(null);
    if (recording) {
      stop();
      return;
    }
    const SR = getSpeechRecognition();
    if (!SR) {
      setError('当前浏览器不支持语音识别');
      return;
    }
    const rec = new SR();
    rec.continuous = continuous;
    rec.interimResults = false;
    rec.lang = lang;
    let buffer = '';
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r && r[0]) buffer += r[0].transcript;
      }
    };
    rec.onerror = (e) => {
      setError(`语音识别失败：${e.error}`);
      setRecording(false);
    };
    rec.onend = () => {
      setRecording(false);
      if (buffer && onResultRef.current) {
        onResultRef.current(buffer.trim());
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch (e) {
      setError(`无法启动语音识别：${(e as Error).message}`);
    }
  }, [recording, continuous, lang, stop]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
    };
  }, []);

  return { recording, supported, error, toggle, stop };
}