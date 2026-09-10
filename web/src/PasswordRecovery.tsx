import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { requestPasswordRecovery, saveOwnerPassword } from './lib/passwordRecovery';

export default function PasswordRecovery({ session }: { session: Session | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      if (session) {
        await saveOwnerPassword(password, confirmation);
        setPassword(''); setConfirmation(''); setSaved(true);
      } else {
        await requestPasswordRecovery(email, window.location.origin);
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete the request. Please try again.');
    } finally { setBusy(false); }
  }

  return <div className="ds-login">
    <div className="ds-login-art">
      <span className="ds-wordmark">DEAD<span>SET</span><small>HQ</small></span>
      <div><p className="ds-kicker">OWNER ACCESS</p><h1>BACK TO<br /><em>BUILDING.</em></h1><p>Your workspace is waiting.</p></div>
      <small>FORGE YOUR BODY. BUILD YOUR BUSINESS.</small>
    </div>
    <section className="ds-login-form">
      <p className="ds-kicker">ACCOUNT RECOVERY</p>
      <h2>{saved ? 'Password saved.' : session ? 'Set your password.' : 'Get back in.'}</h2>
      <p>{saved ? 'Your owner account is ready.' : session ? `Update the password for ${session.user.email ?? 'your owner account'}.` : 'Enter your owner email to receive a secure recovery link. If a link has expired, request a new one here.'}</p>
      {saved ? <Link className="ds-primary" to="/deadset">Enter DEADSET HQ</Link> : <form onSubmit={submit}>
        {session ? <>
          <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        </> : <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e => { setEmail(e.target.value); setSent(false); }} /></label>}
        <button className="ds-primary" disabled={busy || (!session && sent)}>{busy ? 'Please wait…' : session ? 'Save password' : sent ? 'Recovery email requested' : 'Send recovery link'}</button>
        {sent && !session && <p role="status">If this email belongs to an account, a recovery link is on its way. Check your inbox and junk folder.</p>}
        {error && <p className="ds-alert" role="alert">{error}</p>}
      </form>}
      <Link to="/deadset">Back to sign-in</Link>
    </section>
  </div>;
}
