import { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Magic-link sign in. Anyone can request a link, but RLS and the Worker only
 * answer to OWNER_EMAIL, so a link sent elsewhere opens an empty dashboard.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="center-screen">
      <div className="login card">
        <h1>Automations</h1>
        {sent ? (
          <p>Check {email} for a sign-in link.</p>
        ) : (
          <>
            <p>Private control plane. Sign in to continue.</p>
            <form onSubmit={submit}>
              <input
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
            {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
