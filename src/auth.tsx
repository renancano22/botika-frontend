import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, describeError, TOKEN_KEY, type ErrorInfo } from './api';
import type { User } from './types';
import { toast } from './components/feedback';
import { hasPermission, PERMISSION_DENIED } from './permissions';

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
  /** True when the user may use the feature (keys separated by "|" = any of them). */
  can: (keys: string) => boolean;
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

  // Keep permissions up to date: after the server refused an action, and every few minutes,
  // so changes made by the administrator reach users who are already logged in.
  useEffect(() => {
    if (!user) return;
    const refresh = () => { api.get<User>('/me').then((res) => setUser(res.data)).catch(() => { /* keep the current user */ }); };
    window.addEventListener(PERMISSION_DENIED, refresh);
    const id = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.removeEventListener(PERMISSION_DENIED, refresh);
      window.clearInterval(id);
    };
  }, [user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Log out on this device immediately, then end the session on the server in the background
      // (with the token read before it is removed), so a slow connection does not delay anything.
      const token = localStorage.getItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      toast.success('Logged out', { description: 'You have safely logged out of BulanBotikaCare.' });
      if (token) api.post('/logout', null, { headers: { Authorization: `Bearer ${token}` } }).catch(() => { /* already ended or offline */ });
    },
    setUser,
    can: (keys) => hasPermission(user, keys),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
