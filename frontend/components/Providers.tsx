'use client';

import { DialogProvider } from './DialogProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return <DialogProvider>{children}</DialogProvider>;
}