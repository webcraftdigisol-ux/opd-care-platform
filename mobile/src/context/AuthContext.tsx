import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClinicSummary, PublicUser } from '@opd/shared';
import { fetchMe } from '../api/auth';
import { fetchCurrentClinic } from '../api/clinics';
import { TOKEN_KEY } from '../api/client';

const USER_KEY = 'opd_user';
const CLINIC_KEY = 'opd_clinic';

interface AuthContextValue {
  user: PublicUser | null;
  clinic: ClinicSummary | null;
  loading: boolean;
  setSession: (token: string, user: PublicUser, clinic: ClinicSummary) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [clinic, setClinic] = useState<ClinicSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const [me, currentClinic] = await Promise.all([fetchMe(), fetchCurrentClinic()]);
        setUser(me);
        setClinic(currentClinic);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(me));
        await AsyncStorage.setItem(CLINIC_KEY, JSON.stringify(currentClinic));
      } catch {
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, CLINIC_KEY]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function setSession(token: string, nextUser: PublicUser, nextClinic: ClinicSummary) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    await AsyncStorage.setItem(CLINIC_KEY, JSON.stringify(nextClinic));
    setUser(nextUser);
    setClinic(nextClinic);
  }

  async function logout() {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, CLINIC_KEY]);
    setUser(null);
    setClinic(null);
  }

  return (
    <AuthContext.Provider value={{ user, clinic, loading, setSession, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
