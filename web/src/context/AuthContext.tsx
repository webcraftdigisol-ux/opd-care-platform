import React, { createContext, useContext, useEffect, useState } from 'react';
import type { PublicUser } from '@opd/shared';
import { fetchMe } from '../api/auth';

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  setSession: (token: string, user: PublicUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => {
    const raw = localStorage.getItem('opd_user');
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('opd_token');
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((me) => {
        setUser(me);
        localStorage.setItem('opd_user', JSON.stringify(me));
      })
      .catch(() => {
        localStorage.removeItem('opd_token');
        localStorage.removeItem('opd_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function setSession(token: string, nextUser: PublicUser) {
    localStorage.setItem('opd_token', token);
    localStorage.setItem('opd_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem('opd_token');
    localStorage.removeItem('opd_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setSession, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
