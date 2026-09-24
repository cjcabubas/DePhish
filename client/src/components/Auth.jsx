import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, LogIn, ShieldCheck, UserPlus } from 'lucide-react';

export function Auth({ mode, setMode, submit }) {
  const signup = mode === 'signup';
  const recovery = mode === 'forgot-password';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryRequested, setRecoveryRequested] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (recovery) {
      setRecoveryRequested(true);
      return;
    }
    setBusy(true);
    setError('');
    try { await submit(form); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <main className="authPage">
    <button className="brand authBrand" disabled={busy} onClick={() => setMode(null)} aria-label="DePhish — go to scanner">
      <span className="brandmark"><ShieldCheck size={25}/></span><span>De<span>Phish</span></span>
    </button>
    <nav className="authNavigation" aria-label="Authentication navigation">
      <button type="button" disabled={busy} onClick={() => setMode(null)}><ArrowLeft size={16}/>Back to scanner</button>
      {recovery && <button type="button" disabled={busy} onClick={() => setMode('login')}><LogIn size={16}/>Back to log in</button>}
    </nav>
    <section className="authCard" aria-labelledby="authTitle">
      <span className="authIcon">{recovery ? <LockKeyhole/> : signup ? <UserPlus/> : <LogIn/>}</span>
      <h1 id="authTitle">{recovery ? 'Forgot your password?' : signup ? 'Create your account' : 'Welcome back'}</h1>
      <p>{recovery ? 'Enter the email address associated with your account.' : signup ? 'Start scanning and keep your security history in one place.' : 'Log in to view your previous scans and reports.'}</p>
      {recovery && <p className="authNotice">Password recovery is coming soon. This form does not send a reset email yet.</p>}
      <form onSubmit={onSubmit} aria-busy={busy}>
        {signup && <label>Full name<input required maxLength={80} autoComplete="name" disabled={busy} placeholder="Your name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label>}
        <label>Email address<input required maxLength={254} autoComplete="email" disabled={busy} type="email" placeholder="you@example.com" value={form.email} onChange={event => { setForm({ ...form, email: event.target.value }); setRecoveryRequested(false); }}/></label>
        {!recovery && <label>Password<input required type="password" disabled={busy} autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 12 : 1} maxLength={72} placeholder={signup ? 'At least 12 characters' : 'Your password'} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>}
        {!signup && !recovery && <button className="authForgot" type="button" disabled={busy} onClick={() => setMode('forgot-password')}>Forgot password?</button>}
        {error && <p className="scanError" role="alert">{error}</p>}
        {recoveryRequested && <div className="authNotice" role="status">Password reset is not available yet. No email has been sent. You can return to log in or continue using the scanner.</div>}
        <button type="submit" className="primary submit" disabled={busy || (recovery && recoveryRequested)}>{busy ? 'Please wait…' : recovery ? 'Request password reset' : signup ? 'Create account' : 'Log in'} <ArrowRight size={16}/></button>
      </form>
      <div className="authSwitch">{signup || recovery ? 'Already have an account?' : 'New to DePhish?'} <button type="button" disabled={busy} onClick={() => setMode(signup || recovery ? 'login' : 'signup')}>{signup || recovery ? 'Log in' : 'Create an account'}</button></div>
    </section>
  </main>;
}
