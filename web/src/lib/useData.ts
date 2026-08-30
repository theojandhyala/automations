import { useCallback, useEffect, useState } from 'react';

/**
 * Polling fetch hook. The dashboard is single-user and low traffic, so polling
 * every few seconds is simpler and more predictable than realtime subscriptions.
 */
export function useData<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  intervalMs = 5000,
): { data: T | null; error: string | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const refresh = useCallback(() => {
    let cancelled = false;
    run()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [run]);

  useEffect(() => {
    const cancel = refresh();
    if (!intervalMs) return cancel;
    const timer = setInterval(refresh, intervalMs);
    return () => {
      cancel();
      clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh };
}
