import { useCallback, useEffect, useRef, useState } from 'react';
import { LIVE_DATA_EVENT } from './liveSync';

/** Each request belongs to one source scope; an old app's response cannot win. */
export function useData<T>(
  load: () => Promise<T>, deps: unknown[] = [], intervalMs = 5000,
): { data: T | null; error: string | null; loading: boolean; refresh: () => void } {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const [state, setState] = useState<{ source: typeof run; data: T | null; error: string | null; loading: boolean }>(
    { source: run, data: null, error: null, loading: true },
  );
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    let active = true, inFlight = false, pending = false;
    const request = () => {
      if (!active) return;
      if (inFlight) { pending = true; return; }
      inFlight = true;
      void run().then(data => {
        if (active) setState({ source: run, data, error: null, loading: false });
      }).catch((err: unknown) => {
        if (active) setState(current => ({ source: run,
          data: current.source === run ? current.data : null,
          error: err instanceof Error ? err.message : String(err), loading: false }));
      }).finally(() => {
        inFlight = false;
        if (active && pending) { pending = false; request(); }
      });
    };
    refreshRef.current = request;
    request();
    let liveTimer: number | null = null;
    const onLiveData = () => {
      if (liveTimer !== null) window.clearTimeout(liveTimer);
      liveTimer = window.setTimeout(request, 90);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    window.addEventListener(LIVE_DATA_EVENT, onLiveData);
    window.addEventListener('online', request);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = intervalMs ? window.setInterval(onVisible, intervalMs) : null;
    return () => {
      active = false;
      window.removeEventListener(LIVE_DATA_EVENT, onLiveData);
      window.removeEventListener('online', request);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      if (liveTimer !== null) window.clearTimeout(liveTimer);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [run, intervalMs]);
  const current = state.source === run ? state : { data: null, error: null, loading: true };
  return { data: current.data, error: current.error, loading: current.loading, refresh };
}
