'use client';

import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  cmdK?: (e: KeyboardEvent) => void;
  esc?: (e: KeyboardEvent) => void;
  enter?: (e: KeyboardEvent) => void;
}

export function useShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        ref.current.cmdK?.(e);
        return;
      }
      if (e.key === 'Escape') {
        if (inEditable) return;
        ref.current.esc?.(e);
        return;
      }
      if (e.key === 'Enter' && !cmd) {
        if (inEditable) return;
        ref.current.enter?.(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
