import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ClinicSummary, PublicUser } from '@opd/shared';
import { fetchMe } from '../api/auth';
import { fetchCurrentClinic } from '../api/clinics';

interface AuthContextValue {
  user: PublicUser | null;
  clinic: ClinicSummary | null;
  loading: boolean;
  setSession: (token: string, user: PublicUser, clinic: ClinicSummary) => void;
  updateUser: (user: PublicUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => {
    const raw = localStorage.getItem('opd_user');
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  });
  const [clinic, setClinic] = useState<ClinicSummary | null>(() => {
    const raw = localStorage.getItem('opd_clinic');
    return raw ? (JSON.parse(raw) as ClinicSummary) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('opd_token');
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([fetchMe(), fetchCurrentClinic()])
      .then(([me, currentClinic]) => {
        setUser(me);
        setClinic(currentClinic);
        localStorage.setItem('opd_user', JSON.stringify(me));
        localStorage.setItem('opd_clinic', JSON.stringify(currentClinic));
      })
      .catch(() => {
        localStorage.removeItem('opd_token');
        localStorage.removeItem('opd_user');
        localStorage.removeItem('opd_clinic');
        setUser(null);
        setClinic(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function setSession(token: string, nextUser: PublicUser, nextClinic: ClinicSummary) {
    localStorage.setItem('opd_token', token);
    localStorage.setItem('opd_user', JSON.stringify(nextUser));
    localStorage.setItem('opd_clinic', JSON.stringify(nextClinic));
    setUser(nextUser);
    setClinic(nextClinic);
  }

  function updateUser(nextUser: PublicUser) {
    localStorage.setItem('opd_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem('opd_token');
    localStorage.removeItem('opd_user');
    localStorage.removeItem('opd_clinic');
    setUser(null);
    setClinic(null);
  }

  return (
    <AuthContext.Provider value={{ user, clinic, loading, setSession, updateUser, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
