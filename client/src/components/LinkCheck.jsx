import React from 'react';
const date = value => value ? new Date(value).toLocaleDateString() : 'Unavailable';
export function LinkCheck({ result }) {
  if (!result) return null;
  const { destination, registration } = result;
  return <div className="linkCheck linkFacts">
    <dl>
      <dt>Connection/check status</dt><dd>{destination?.status || 'Not inspected'}</dd>
      <dt>Risk contribution</dt><dd>{result.risk ? `${result.risk.score} policy points` : 'Unavailable'}</dd>
      {destination?.reason && <><dt>DNS / reachability</dt><dd>{destination.reason}</dd></>}
      {destination?.failure_code && <><dt>Check failure code</dt><dd>{destination.failure_code}</dd></>}
    </dl>
    {result.risk?.factors?.length > 0 && <><h5>Findings</h5><ul>{result.risk.factors.map(factor => <li key={factor.code}>{factor.explanation} (+{factor.points} points)</li>)}</ul></>}
    {destination?.redirects?.map((hop, i) => <div className="linkHop" key={i}>
      <b>{i === 0 ? 'Submitted destination' : `Redirect ${i}`}</b><p>{hop.url}</p>
      <dl><dt>DNS address</dt><dd>{hop.address || 'Unavailable'}</dd><dt>HTTP status</dt><dd>{hop.http_status}</dd><dt>TLS certificate</dt><dd>{hop.tls?.status === 'valid' ? 'Valid chain and hostname' : hop.tls?.status === 'not_used' ? 'Not used (HTTP)' : 'Unavailable'}</dd>
      {hop.tls?.status === 'valid' && <><dt>Issuer</dt><dd>{hop.tls.issuer || 'Unavailable'}</dd><dt>Valid from</dt><dd>{date(hop.tls.valid_from)}</dd><dt>Valid until</dt><dd>{date(hop.tls.valid_until)} ({hop.tls.days_remaining} days remaining)</dd></>}</dl>
    </div>)}
    {destination?.tls?.status === 'invalid' && <p>Certificate validation failed at {destination.failed_url}.</p>}
    {destination?.note && <p>{destination.note}</p>}
    <section className="domainInformation"><h5>Domain Information</h5>
      <dl>
        <dt>Registrable domain</dt><dd><strong>{result.domain || 'Unavailable'}</strong></dd>
        <dt>Registration date</dt><dd>{date(registration?.registered_at)}</dd>
        <dt>Domain age</dt><dd>{registration?.age_days == null ? 'Unavailable' : `${registration.age_days.toLocaleString()} days`}</dd>
        <dt>Registrar</dt><dd>{registration?.registrar || 'Unavailable'}</dd>
        <dt>Public registrant</dt><dd>{registration?.registrant || 'Not disclosed / unavailable'}</dd>
        <dt>Expiration date</dt><dd>{date(registration?.expires_at)}</dd>
      </dl>
      <p>Registration information describes the registrable domain, not the age or trustworthiness of the specific scanned hostname.</p>
      {registration?.ownership_note && <p>{registration.ownership_note}</p>}
      {registration?.reason && <p>{registration.reason}</p>}
      {result.limitations && <small>{result.limitations}</small>}
    </section>
  </div>;
}
