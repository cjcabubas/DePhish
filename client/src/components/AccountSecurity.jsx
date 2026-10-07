import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PasswordInput } from './PasswordInput';

export function AccountSecurity({ api }) {
  const [state, setState] = useState(null);
  const [step, setStep] = useState('overview');
  const [password, setPassword] = useState(''), [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError('');
    try { setState(await api.security()); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { let active = true; api.security().then(value => { if (active) setState(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [api]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  function cancel() { setStep('overview'); setPassword(''); setCode(''); setError(''); setNotice(''); }
  async function request(e) {
    e?.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await api.requestMfa({ password, enabled: !state.mfaEnabled }); setStep('code'); setCode(''); setCooldown(60); setNotice('A confirmation code was sent to your email.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function verify(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.verifyMfaSetting({ code, enabled: !state.mfaEnabled });
      setState({ ...state, mfaEnabled: result.mfaEnabled }); setStep('overview'); setCode(''); setPassword('');
      setNotice(`Two-step verification is now ${result.mfaEnabled ? 'on' : 'off'}.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="panel securityPanel" aria-labelledby="security-heading">
    <div className="securityHeading"><span className="securityIcon"><ShieldCheck size={20} aria-hidden="true"/></span><div><h2 id="security-heading">Security</h2><p>Choose how you protect your account.</p></div></div>
    {loading && <p role="status">Loading security settings…</p>}
    {!loading && !state && <button className="outline" onClick={load}>Try again</button>}
    {state && <>
      <div className="securityOverview"><div><h3>Two-step verification <span className={`securityStatus ${state.mfaEnabled ? 'isEnabled' : ''}`}>{state.mfaEnabled ? 'On' : 'Off'}</span></h3><p>Enter a code sent to your email after your password when you sign in.</p></div>
        {step === 'overview' && <button className={state.mfaEnabled ? 'outline' : 'primary'} onClick={() => { setStep('password'); setError(''); setNotice(''); }}>{state.mfaEnabled ? 'Turn off' : 'Set up'}</button>}
      </div>
      {step !== 'overview' && <form className="securityForm" onSubmit={step === 'password' ? request : verify} aria-busy={busy}>
        <span className="securityStep">Step {step === 'password' ? '1' : '2'} of 2</span>
        <h3>{step === 'password' ? 'Confirm it’s you' : 'Check your email'}</h3>
        <p>{step === 'password' ? `Enter your current password to ${state.mfaEnabled ? 'turn off' : 'set up'} two-step verification.` : 'Enter the 6-digit code we sent you. It expires in 5 minutes.'}</p>
        {step === 'password' ? <label htmlFor="security-password">Current password<PasswordInput id="security-password" required autoFocus disabled={busy} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
          : <label htmlFor="security-code">Email confirmation code<input id="security-code" className="securityCode" required autoFocus disabled={busy} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}/></label>}
        {step === 'code' && <button type="button" className="securityResend" disabled={busy || cooldown > 0} onClick={request}>{cooldown ? `Resend code in ${cooldown}s` : 'Resend code'}</button>}
        <div className="securityActions"><button className="primary" disabled={busy || (step === 'password' ? !password : code.length !== 6)}>{busy ? 'Please wait…' : step === 'password' ? 'Send confirmation code' : state.mfaEnabled ? 'Confirm and turn off' : 'Confirm and turn on'}</button><button type="button" className="outline" disabled={busy} onClick={cancel}>Cancel</button></div>
      </form>}
    </>}
    {error && <p className="scanError" role="alert">{error}</p>}
    {notice && <p className="securityNotice" role="status">{notice}</p>}
  </section>;
}
