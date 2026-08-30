import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import CommandCenter from './pages/CommandCenter';
import Overview from './pages/Overview';
import AutomationDetail from './pages/AutomationDetail';
import Queue from './pages/Queue';
import Accounts from './pages/Accounts';
import Reports from './pages/Reports';
import HudPreview from './pages/HudPreview';
import CreativeStudio from './pages/CreativeStudio';

/**
 * The command center is the landing page and gets the full viewport with no
 * chrome around it. Every other page keeps the sidebar shell.
 */
function Shell({ session }: { session: Session }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>Automations</h1>
        <nav>
          <NavLink to="/" end>Command center</NavLink>
          <NavLink to="/overview">Overview</NavLink>
          <NavLink to="/queue">Review queue</NavLink>
          <NavLink to="/studio">Creative studio</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/accounts">Accounts</NavLink>
        </nav>
        <div className="foot">
          <div style={{ marginBottom: 8, wordBreak: 'break-all' }}>{session.user.email}</div>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="/automations/:id" element={<AutomationDetail />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/studio" element={<CreativeStudio />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
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

  if (!ready) return null;
  if (!session) return <Login />;

  if (location.pathname === '/') {
    return (
      <>
        <CommandCenter />
        <NavLink to="/overview" className="escape-hatch">Tables →</NavLink>
      </>
    );
  }

  return <Shell session={session} />;
}
