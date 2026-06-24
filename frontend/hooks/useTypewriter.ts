'use client';

import { useEffect, useRef, useState } from 'react';

export function useTypewriter(target: string, speedMs = 22): string {
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    let idx = displayedRef.current.length;
    if (idx >= targetRef.current.length) {
      setDisplayed(targetRef.current);
      return;
    }
    const interval = setInterval(() => {
      if (idx < targetRef.current.length) {
        idx += 1;
        const next = targetRef.current.slice(0, idx);
        displayedRef.current = next;
        setDisplayed(next);
      } else {
        clearInterval(interval);
      }
    }, speedMs);
    return () => clearInterval(interval);
  }, [target, speedMs]);

  return displayed;
}