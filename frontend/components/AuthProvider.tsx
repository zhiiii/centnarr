'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, UserView } from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: UserView | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { display_name?: string; avatar_color?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserView | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const u = await api.auth.me();
      setUser(u);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api.auth.login(email, password);
      setUser(r.user);
      setStatus('authenticated');
    },
    [],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const r = await api.auth.register(email, password, displayName);
      setUser(r.user);
      setStatus('authenticated');
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
      router.push('/login');
    }
  }, [router]);

  const updateProfile = useCallback(async (data: { display_name?: string; avatar_color?: string }) => {
    const u = await api.auth.updateProfile(data);
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, refresh, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}