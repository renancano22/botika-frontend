import axios, { AxiosError } from 'axios';

export const TOKEN_KEY = 'botika_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api',
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/** Turns a Laravel error response into one readable message. */
export function errorMessage(err: unknown): string {
  const e = err as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
  const data = e.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.message) return data.message;
  if (e.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the backend running?';
  return 'Something went wrong. Please try again.';
}

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  staff: 'Pharmacy Staff',
  resident: 'Resident',
};

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = new Date(value);
  return withTime
    ? d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('en-PH', { dateStyle: 'medium' });
}
