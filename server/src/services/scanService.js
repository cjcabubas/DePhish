import { inspectLink, inspectionError } from './linkService.js';

// Provisional policy points, not probabilities or a trained URL classifier.
export function linkRisk(check) {
  const factors = [];
  const add = (code, points, explanation) => factors.push({ code, points, explanation });
  const age = check.registration?.age_days;
  if (age != null && age < 30) add('new_domain', 20, 'Domain registered less than 30 days ago.');
  else if (age != null && age < 180) add('recent_domain', 10, 'Domain registered less than 180 days ago.');
  const destination = check.destination || {};
  const unreachable = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'TIMEOUT', 'ABORT_ERR', 'EHOSTUNREACH', 'ENETUNREACH'].includes(destination.failure_code);
  const httpStatus = destination.redirects?.at(-1)?.http_status;
  if (destination.failure_code === 'INVALID_DOMAIN')
    add('invalid_domain', 5, 'This address uses the reserved .invalid suffix and cannot lead to a public website. This is a broken-link warning, not proof of phishing.');
  else if (unreachable || [404, 410].includes(httpStatus) || (httpStatus >= 500 && destination.failure_code !== 'HEAD_UNSUPPORTED'))
    add('unavailable_destination', 5, 'The link could not be reached or returned a missing-page/server error. This is a weak warning and may be temporary; it is not proof of phishing.');
  if (destination.tls?.status === 'invalid') add('invalid_certificate', 20, 'TLS certificate verification failed.');
  if (destination.reason?.includes('downgrades HTTPS')) add('https_downgrade', 15, 'Redirect attempted to downgrade HTTPS to HTTP.');
  if (destination.redirects?.some(hop => hop.url.startsWith('http:'))) add('unencrypted_connection', 5, 'A destination uses unencrypted HTTP.');
  return { score: Math.min(40, factors.reduce((sum, factor) => sum + factor.points, 0)), factors };
}

export async function assessScan(input, { classify, inspect = inspectLink }) {
  const result = await classify(input);
  const urls = [...new Set(result.detected_urls.map(item => item.url))];
  // Bound outbound work; repeated URLs do not multiply policy points.
  const checks = await Promise.all(urls.slice(0, 3).map(async url => {
    try { const evidence = await inspect(url); return { ...evidence, url, risk: linkRisk(evidence) }; }
    catch (error) { return { url, registration: { status: 'unavailable' }, destination: { status: 'incomplete', ...inspectionError(error), redirects: [] }, risk: { score: 0, factors: [] } }; }
  }));
  const points = Math.max(0, ...checks.map(check => check.risk.score));
  const score = Math.min(100, Math.round((result.risk_score + points) * 10) / 10);
  const prediction = score >= 70 ? 'Phishing' : score >= 35 ? 'Suspicious' : 'Legitimate';
  return { ...result, model_risk_score: result.risk_score, model_prediction: result.prediction,
    risk_score: score, prediction, risk_level: score >= 70 ? 'High Risk' : score >= 35 ? 'Medium Risk' : 'Low Risk',
    scoring_version: '3.1.2-link-policy', link_checks: checks,
    link_risk: { points, checked: checks.length, skipped: Math.max(0, urls.length - checks.length),
      incomplete: checks.some(check => check.registration.age_days == null || check.destination.status !== 'checked'),
      note: 'Combined risk uses provisional link policy points. Model probabilities and confidence describe message classification only. Unreachable or broken destinations add 5 points; missing registry data or internal inspection failures add none. Valid TLS and domain age never subtract risk.' } };
}
