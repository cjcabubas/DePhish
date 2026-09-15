import React from 'react';
import { linkCheckSummary } from '../services/linkWording';
const date = value => value ? new Date(value).toLocaleDateString() : 'Unavailable';
export function LinkCheck({ result }) {
  if (!result) return null;
  return <div className="linkCheck">
    <p>{linkCheckSummary(result)}</p>
    {result.risk.factors.map(factor => <p key={factor.code}>{factor.explanation} (+{factor.points})</p>)}
    {result && <div className="linkFacts" aria-live="polite">
      <b>Domain: {result.domain || result.hostname}</b>
      <dl>
        <dt>Registered</dt><dd>{date(result.registration.registered_at)}</dd>
        <dt>Domain age</dt><dd>{result.registration.age_days == null ? 'Unavailable' : `${result.registration.age_days.toLocaleString()} days`}</dd>
        <dt>Registrar</dt><dd>{result.registration.registrar || 'Unavailable'}</dd>
        <dt>Public registrant</dt><dd>{result.registration.registrant || 'Not disclosed / unavailable'}</dd>
        <dt>Registration expires</dt><dd>{date(result.registration.expires_at)}</dd>
      </dl>
      <p>{result.registration.ownership_note || result.registration.reason}</p>
      <p>Connection: {result.destination.status}. {result.destination.reason}</p>
      {result.destination.redirects.map((hop, i) => <div className="linkHop" key={i}>
        <b>{i === 0 ? 'Submitted destination' : `Redirect ${i}`}</b><p>{hop.url}</p>
        <dl><dt>HTTP status</dt><dd>{hop.http_status}</dd><dt>TLS certificate</dt><dd>{hop.tls?.status === 'valid' ? 'Valid chain and hostname' : hop.tls?.status === 'not_used' ? 'Not used (HTTP)' : 'Unavailable'}</dd>
        {hop.tls?.status === 'valid' && <><dt>Issuer</dt><dd>{hop.tls.issuer || 'Unavailable'}</dd><dt>Valid from</dt><dd>{date(hop.tls.valid_from)}</dd><dt>Valid until</dt><dd>{date(hop.tls.valid_until)} ({hop.tls.days_remaining} days remaining)</dd></>}</dl>
      </div>)}
      {result.destination.tls?.status === 'invalid' && <p>Certificate validation failed at {result.destination.failed_url}.</p>}
      <small>{result.limitations}</small>
    </div>}

  </div>;
}
