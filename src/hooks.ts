import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from './api';

/**
 * Loads data from the API and refreshes it every `refreshMs` (real-time monitoring).
 * Pass refreshMs = 0 to disable auto refresh.
 */
export function useApi<T>(url: string | null, params?: Record<string, unknown>, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(params ?? {});

  const load = useCallback(async (silent = false) => {
    if (!url) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.get<T>(url, { params: JSON.parse(key) });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [url, key]);

  useEffect(() => {
    load();
    if (!refreshMs) return;
    const id = window.setInterval(() => load(true), refreshMs);
    return () => window.clearInterval(id);
  }, [load, refreshMs]);

  return { data, error, loading, reload: load, setData };
}

/**
 * Back arrow: goes to the previous page, or to `fallback` when the page was opened directly
 * (e.g. from a link or after refreshing), so it never leaves the system.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
