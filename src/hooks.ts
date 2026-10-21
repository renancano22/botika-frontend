import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, describeError, type ErrorInfo } from './api';
import { RECONNECTED, toast } from './components/feedback';

/**
 * Loads data from the API and refreshes it every `refreshMs` (real-time monitoring).
 * Pass refreshMs = 0 to disable auto refresh.
 *  - First load fails: `error` / `errorInfo` are set (pages show LoadError with "Try again").
 *  - Data is already shown and a refresh fails: the data stays on screen. A refresh the user asked
 *    for (e.g. a new search) shows an error toast; background refreshes stay quiet, because the
 *    connection notice already tells the user when they are offline.
 *  - When the internet connection comes back, the data is refreshed.
 */
export function useApi<T>(url: string | null, params?: Record<string, unknown>, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(params ?? {});
  // The params of the data on screen (it may still be the previous list while a new one is loading).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const hasData = useRef(false);
  hasData.current = data !== null;

  const load = useCallback(async (silent = false) => {
    if (!url) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.get<T>(url, { params: JSON.parse(key) });
      setData(res.data);
      setLoadedKey(key);
      setErrorInfo(null);
    } catch (err) {
      if (!hasData.current) setErrorInfo(describeError(err));
      else if (!silent) toast.fromError(err, { title: 'Unable to refresh', retry: () => load() });
    } finally {
      setLoading(false);
    }
  }, [url, key]);

  useEffect(() => {
    load();
    const again = () => load(true);
    window.addEventListener(RECONNECTED, again);
    const id = refreshMs ? window.setInterval(again, refreshMs) : 0;
    return () => {
      window.removeEventListener(RECONNECTED, again);
      if (id) window.clearInterval(id);
    };
  }, [load, refreshMs]);

  return { data, error: errorInfo?.message ?? null, errorInfo, loading, reload: load, setData, current: loadedKey === key };
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
