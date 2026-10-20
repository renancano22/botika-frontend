import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

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
  // A request that gets no answer within 60 seconds fails with a "connection is slow" message
  // instead of waiting forever.
  timeout: 60000,
});

/* ---------- slow connection: requests still waiting after a few seconds are reported to the banner */
const SLOW_AFTER_MS = 6000;
let slowCount = 0;
const slowListeners = new Set<(slow: boolean) => void>();
export function onSlowConnection(listener: (slow: boolean) => void): () => void {
  slowListeners.add(listener);
  return () => { slowListeners.delete(listener); };
}
const setSlow = (delta: number) => {
  const before = slowCount > 0;
  slowCount = Math.max(0, slowCount + delta);
  if (before !== slowCount > 0) slowListeners.forEach((l) => l(slowCount > 0));
};
type Tracked = InternalAxiosRequestConfig & { _slowTimer?: number; _slow?: boolean };
const finish = (config?: Tracked) => {
  if (!config) return;
  window.clearTimeout(config._slowTimer);
  if (config._slow) { config._slow = false; setSlow(-1); }
};

/** Shown on the log-in page after the session ended (token expired or was revoked). */
export const SESSION_NOTICE_KEY = 'botika_session_notice';

api.interceptors.request.use((config: Tracked) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config._slowTimer = window.setTimeout(() => { config._slow = true; setSlow(1); }, SLOW_AFTER_MS);
  return config;
});

api.interceptors.response.use(
  (res) => { finish(res.config as Tracked); return res; },
  (error: AxiosError) => {
    finish(error.config as Tracked | undefined);
    // Session expired (or the account was logged out elsewhere): back to the log-in page with an explanation.
    if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY) && !error.config?.url?.endsWith('/login')) {
      localStorage.removeItem(TOKEN_KEY);
      try { sessionStorage.setItem(SESSION_NOTICE_KEY, 'expired'); } catch { /* storage blocked */ }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/* ---------- error messages */

export type ErrorKind = 'offline' | 'network' | 'timeout' | 'validation' | 'session' | 'forbidden' | 'notfound'
  | 'conflict' | 'too_large' | 'rate_limit' | 'server' | 'unavailable' | 'unknown';

export interface ErrorInfo {
  kind: ErrorKind;
  /** Short heading, e.g. "No internet connection". */
  title: string;
  /** What happened and what to do, in plain language. */
  message: string;
  /** Validation messages per form field (from Laravel's 422 "errors"). */
  fields: Record<string, string>;
  /** True when trying again may work (connection or server problems). */
  retryable: boolean;
  status?: number;
}

/** Server messages that are technical (or from the framework) and must not be shown to users. */
const TECHNICAL = /SQLSTATE|Exception|Stack trace|App\\|Illuminate|No query results|The route .* could not be found|Server Error|Unauthenticated|vendor\//i;

/** Turns any error (network, Laravel response, JavaScript) into a clear message for the user. */
export function describeError(err: unknown): ErrorInfo {
  const e = err as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
  const base = { fields: {} as Record<string, string>, retryable: false };
  if (!e || !(e as AxiosError).isAxiosError) {
    const msg = err instanceof Error && err.message && !TECHNICAL.test(err.message) ? err.message : 'Something went wrong. Please try again.';
    return { ...base, kind: 'unknown', title: 'Something went wrong', message: msg };
  }
  if (!e.response) {
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
      return { ...base, kind: 'timeout', retryable: true, title: 'Connection is slow',
        message: 'The server took too long to respond. Your internet connection may be slow or unstable. Please try again.' };
    }
    if (!navigator.onLine) {
      return { ...base, kind: 'offline', retryable: true, title: 'No internet connection',
        message: 'You appear to be offline. Check your Wi-Fi or mobile data, then try again.' };
    }
    return { ...base, kind: 'network', retryable: true, title: 'Unable to connect',
      message: 'We could not reach BulanBotikaCare. Please check your internet connection and try again.' };
  }
  const status = e.response.status;
  const data = e.response.data;
  const serverMsg = typeof data?.message === 'string' && data.message.trim() && !TECHNICAL.test(data.message) ? data.message.trim() : '';

  if (status === 422 && data?.errors) {
    // open_request_id is extra data (which request to edit), not a message.
    const entries = Object.entries(data.errors).filter(([k]) => k !== 'open_request_id');
    const fields: Record<string, string> = {};
    entries.forEach(([k, v]) => { fields[k.replace(/\.\d+\./g, '.')] = Array.isArray(v) ? v[0] : String(v); });
    return { ...base, kind: 'validation', status, title: 'Please check your entries', fields,
      message: entries.flatMap(([, v]) => v).join(' ') || 'Some of the information entered is not valid.' };
  }
  const pick = (kind: ErrorKind, title: string, fallback: string, retryable = false): ErrorInfo =>
    ({ ...base, kind, status, title, retryable, message: serverMsg || fallback });
  switch (status) {
    case 401: return { ...pick('session', 'Session expired', ''), message: serverMsg && e.config?.url?.endsWith('/login') ? serverMsg : 'Your session has expired. Please log in again.' };
    case 403: return pick('forbidden', 'Access denied', 'You do not have permission to do this.');
    case 404: return pick('notfound', 'Not found', 'The record you are looking for was not found. It may have been removed.');
    case 409: return pick('conflict', 'Already exists', 'This record already exists.');
    case 413: return pick('too_large', 'File too large', 'The file is too large. Please choose a smaller file.');
    case 419: return pick('session', 'Session expired', 'Your session has expired. Please refresh the page and try again.');
    case 422: return pick('validation', 'Action not allowed', 'This action cannot be completed. Please check the details and try again.');
    case 429: return pick('rate_limit', 'Too many attempts', 'Too many attempts. Please wait a minute and try again.');
    case 503: return { ...pick('unavailable', 'Temporarily unavailable', '', true), message: 'BulanBotikaCare is temporarily unavailable (maintenance). Please try again in a few minutes.' };
    default:
      if (status >= 500) {
        return { ...base, kind: 'server', status, retryable: true, title: 'Something went wrong',
          message: 'Something went wrong on our side. Please try again in a few minutes.' };
      }
      return pick('unknown', 'Something went wrong', 'Something went wrong. Please try again.');
  }
}

/** One readable message for an error (see describeError). */
export function errorMessage(err: unknown): string {
  return describeError(err).message;
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

/** "Just now", "5m ago", "3h ago", "2d ago", then the date (like social media notifications). */
export function timeAgo(value: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(value, true);
}

/** Tells the bell icon to refresh its unread count after notifications are marked as read. */
export const NOTIFICATIONS_CHANGED = 'botika:notifications-changed';
export function notificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
