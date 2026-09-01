import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import CommandCenter from './pages/CommandCenter';
import Queue from './pages/Queue';
import Accounts from './pages/Accounts';
import HudPreview from './pages/HudPreview';
import CreativeStudio from './pages/CreativeStudio';
import PromotionMission from './pages/PromotionMission';
import ArcReactorMark from './components/ArcReactorMark';
import Legal from './pages/Legal';

const WORKSPACE_ROUTES = [
  { to: '/', index: '00', label: 'Command center', short: 'Core', detail: 'Live mission overview', end: true },
  { to: '/promote', index: '01', label: 'App missions', short: 'Missions', detail: 'Create the next batch' },
  { to: '/queue', index: '02', label: 'Review queue', short: 'Review', detail: 'Inspect and authorise' },
  { to: '/studio', index: '03', label: 'Feature proof', short: 'Proof', detail: 'Exact screens and assets' },
  { to: '/accounts', index: '04', label: 'TikTok links', short: 'Uplinks', detail: 'Account connections' },
] as const;

const WORKSPACE_META: Record<string, { code: string; title: string; detail: string }> = {
  '/promote': { code: '01', title: 'Mission composer', detail: 'Turn an outcome into three native, proof-led posts' },
  '/queue': { code: '02', title: 'Review bay', detail: 'Inspect the exact media, copy and destination' },
  '/studio': { code: '03', title: 'Proof foundry', detail: 'Maintain the verified product-screen library' },
  '/accounts': { code: '04', title: 'Channel uplink', detail: 'Connect each app to its correct TikTok identity' },
};

/**
 * The command center is the landing page and gets the full viewport with no
 * chrome around it. Every other page keeps the sidebar shell.
 */
function Shell({ session }: { session: Session }) {
  const location = useLocation();
  const meta = WORKSPACE_META[location.pathname] ?? WORKSPACE_META['/promote']!;

  return (
    <div className="shell jarvis-shell">
      <div className="shell-grid" aria-hidden="true" />
      <div className="shell-scan" aria-hidden="true" />
      <div className="shell-vignette" aria-hidden="true" />
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-reactor"><ArcReactorMark size={52} /></span>
          <div className="sidebar-brand-copy">
            <strong>J.A.R.V.I.S.</strong>
            <small>MARK VII // AUTOMATION CORE</small>
          </div>
        </div>
        <div className="sidebar-core-state">
          <span><i /> SYSTEM ONLINE</span>
          <b>3 MISSION CHANNELS</b>
          <small>Deadset · Cast · LifeScore standby</small>
        </div>
        <nav>
          {WORKSPACE_ROUTES.map((item) => (
            <NavLink to={item.to} end={item.to === '/'} key={item.to}>
              <i>{item.index}</i>
              <span><b>{item.label}</b><small>{item.detail}</small></span>
              <em>›</em>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-channels" aria-label="Mission channel state">
          <article className="online"><i /><span><b>DEADSET</b><small>3/day · channel linked</small></span></article>
          <article className="attention"><i /><span><b>CAST</b><small>3/day · uplink action</small></span></article>
          <article className="locked"><i /><span><b>LIFESCORE</b><small>release lock engaged</small></span></article>
        </div>
        <div className="foot">
          <div><span>OWNER SESSION</span><b>{session.user.email}</b></div>
          <button onClick={() => supabase.auth.signOut()} aria-label="Sign out of JARVIS">EXIT</button>
        </div>
      </aside>
      <section className="jarvis-workspace">
        <header className="workspace-bar">
          <div className="workspace-identity"><i>{meta.code}</i><span><small>J.A.R.V.I.S. WORKSPACE</small><b>{meta.title}</b><em>{meta.detail}</em></span></div>
          <div className="workspace-telemetry">
            <span><i /> SECURE</span>
            <span>POST WINDOWS <b>12 · 15 · 18</b></span>
            <span>UK TIME</span>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/promote" element={<PromotionMission />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/studio" element={<CreativeStudio />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <span className="workspace-corner corner-a" aria-hidden="true" />
        <span className="workspace-corner corner-b" aria-hidden="true" />
      </section>
    </div>
  );
}

function CommandDock() {
  return (
    <nav className="command-dock" aria-label="JARVIS workspaces">
      {WORKSPACE_ROUTES.slice(1).map((item) => (
        <NavLink to={item.to} key={item.to}><i>{item.index}</i><span>{item.short}</span></NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (import.meta.env.DEV && new URLSearchParams(location.search).has('hud-preview')) {
    return <HudPreview />;
  }

  if (location.pathname === '/privacy') return <Legal kind="privacy" />;
  if (location.pathname === '/terms') return <Legal kind="terms" />;

  if (!ready) return null;
  if (!session) return <Login />;

  if (location.pathname === '/') {
    return (
      <>
        <CommandCenter />
        <CommandDock />
      </>
    );
  }

  return <Shell session={session} />;
}
