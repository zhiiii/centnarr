'use client';

import { DialogProvider } from './DialogProvider';
import { AuthProvider } from './AuthProvider';
import { AuthGuard } from './AuthGuard';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DialogProvider>
        <AuthGuard>{children}</AuthGuard>
      </DialogProvider>
    </AuthProvider>
  );
}