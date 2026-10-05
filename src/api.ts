import axios, { AxiosError } from 'axios';

export const TOKEN_KEY = 'botika_token';

/**
 * Address of the Laravel API. If VITE_API_URL is not set, the API is expected on port 8000
 * of the same computer the page was opened from, so it works on the laptop (localhost)
 * and on phones (laptop's Wi-Fi IP) without editing .env when the IP changes.
 */
const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/api`;

export const api = axios.create({
  baseURL: API_URL,
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
