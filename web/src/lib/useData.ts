import { useCallback, useEffect, useRef, useState } from 'react';
import { LIVE_DATA_EVENT } from './liveSync';

/**
 * Owner-data fetch hook. Supabase change events refresh it immediately; the
 * interval remains as a fallback for sleeping tabs and interrupted sockets.
 */
export function useData<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  intervalMs = 5000,
): { data: T | null; error: string | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const refresh = useCallback(() => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    inFlight.current = true;
    void run()
      .then((result) => {
        if (!mounted.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (mounted.current) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        inFlight.current = false;
        if (mounted.current) setLoading(false);
        if (pending.current && mounted.current) {
          pending.current = false;
          refresh();
        }
      });
  }, [run]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    let liveTimer: number | null = null;
    const onLiveData = () => {
      if (liveTimer) window.clearTimeout(liveTimer);
      liveTimer = window.setTimeout(refresh, 90);
    };
    window.addEventListener(LIVE_DATA_EVENT, onLiveData);
    const timer = intervalMs ? window.setInterval(refresh, intervalMs) : null;
    return () => {
      mounted.current = false;
      pending.current = false;
      window.removeEventListener(LIVE_DATA_EVENT, onLiveData);
      if (liveTimer) window.clearTimeout(liveTimer);
      if (timer) window.clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh };
}
