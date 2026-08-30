import { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Magic-link sign in for the pre-created owner account. New account creation
 * stays disabled in Supabase.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = mode === 'password'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: window.location.origin,
            shouldCreateUser: false,
          },
        });
    setBusy(false);
    if (error) setError(error.message);
    else if (mode === 'link') setSent(true);
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
              {mode === 'password' && (
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : mode === 'password' ? 'Sign in' : 'Email me a link'}
              </button>
            </form>
            <button
              type="button"
              className="login-switch"
              onClick={() => {
                setMode((current) => current === 'password' ? 'link' : 'password');
                setError(null);
              }}
            >
              {mode === 'password' ? 'Use an email link instead' : 'Use password instead'}
            </button>
            {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
