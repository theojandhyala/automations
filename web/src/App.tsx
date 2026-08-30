import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import Overview from './pages/Overview';
import AutomationDetail from './pages/AutomationDetail';
import Queue from './pages/Queue';
import Accounts from './pages/Accounts';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <Login />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>Automations</h1>
        <nav>
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/queue">Review queue</NavLink>
          <NavLink to="/accounts">Accounts</NavLink>
        </nav>
        <div className="foot">
          <div style={{ marginBottom: 8, wordBreak: 'break-all' }}>{session.user.email}</div>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/automations/:id" element={<AutomationDetail />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
