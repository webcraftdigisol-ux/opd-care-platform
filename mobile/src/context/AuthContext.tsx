import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PublicUser } from '@opd/shared';
import { fetchMe } from '../api/auth';
import { TOKEN_KEY } from '../api/client';

const USER_KEY = 'opd_user';

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  setSession: (token: string, user: PublicUser) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        setUser(me);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(me));
      } catch {
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function setSession(token: string, nextUser: PublicUser) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  async function logout() {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
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
