import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from './supabase';

export const LIVE_DATA_EVENT = 'jarvis:live-data';

export type LiveLinkStatus = 'connecting' | 'live' | 'fallback';

interface LiveSyncState {
  status: LiveLinkStatus;
  lastEventAt: string | null;
  lastSource: string | null;
}

const DEFAULT_STATE: LiveSyncState = {
  status: 'connecting',
  lastEventAt: null,
  lastSource: null,
};

const LiveSyncContext = createContext<LiveSyncState>(DEFAULT_STATE);

export function LiveSyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiveSyncState>(DEFAULT_STATE);

  const pulse = useCallback((source: string) => {
    const at = new Date().toISOString();
    setState((current) => ({ ...current, lastEventAt: at, lastSource: source }));
    window.dispatchEvent(new CustomEvent(LIVE_DATA_EVENT, { detail: { at, source } }));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('jarvis-live-telemetry')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        pulse(payload.table ?? 'database');
      })
      .subscribe((status) => {
        setState((current) => ({
          ...current,
          status: status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'fallback' : 'connecting',
        }));
      });

    const resync = () => pulse('operator-resync');
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resync();
    };

    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
      document.removeEventListener('visibilitychange', onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [pulse]);

  const value = useMemo(() => state, [state]);
  return <LiveSyncContext.Provider value={value}>{children}</LiveSyncContext.Provider>;
}

export function useLiveSync(): LiveSyncState {
  return useContext(LiveSyncContext);
}
