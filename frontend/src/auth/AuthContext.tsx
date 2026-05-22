import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

const USER_KEY = 'quizgen.user';

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveUser(u: User | null) {
  if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const stored = loadUser();
    if (token && stored) setUser(stored);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    setToken(r.token);
    saveUser(r.user);
    setUser(r.user);
  };

  const register = async (email: string, name: string, password: string) => {
    const r = await api.register(email, name, password);
    setToken(r.token);
    saveUser(r.user);
    setUser(r.user);
  };

  const logout = () => {
    setToken(null);
    saveUser(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
