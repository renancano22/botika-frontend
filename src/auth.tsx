import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, describeError, TOKEN_KEY, type ErrorInfo } from './api';
import type { User } from './types';
import { toast } from './components/feedback';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** The saved session could not be checked because the server could not be reached. */
  connectionError: ErrorInfo | null;
  retry: () => void;
  login: (login: string, password: string) => Promise<void>;
  register: (data: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  /** Replaces the logged-in user's details after they edit their profile. */
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<ErrorInfo | null>(null);

  const checkSession = useCallback(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setConnectionError(null);
    api.get<User>('/me')
      .then((res) => setUser(res.data))
      .catch((err) => {
        const info = describeError(err);
        // Only an invalid/expired session logs the user out; a connection problem keeps them logged in.
        if (info.kind === 'session') localStorage.removeItem(TOKEN_KEY);
        else setConnectionError(info);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const handleAuth = (data: { token: string; user: User }) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  };

  const value: AuthState = {
    user,
    loading,
    connectionError,
    retry: checkSession,
    login: async (login, password) => handleAuth((await api.post('/login', { login, password })).data),
    register: async (data) => handleAuth((await api.post('/register', data)).data),
    logout: async () => {
      try { await api.post('/logout'); } catch { /* token may already be invalid */ }
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      toast.success('Logged out', { description: 'You have safely logged out of BulanBotikaCare.' });
    },
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
