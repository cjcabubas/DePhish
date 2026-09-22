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


export const SCORING_VERSION = '4.0.0-independent-analyzers';
export function evaluateRisk({ model, indicators, urls, entities }) {
  const probability = model.probabilities?.phishing;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('Invalid classifier probability');
  const modelScore = Math.round(probability * 1000) / 10;
  const urlPoints = Math.max(0, ...urls.checks.map(check => check.risk.score));
  const score = Math.min(100, Math.round((modelScore + urlPoints) * 10) / 10);
  const classification = score >= 70 ? 'Phishing' : score >= 35 ? 'Suspicious' : 'Legitimate';
  return { overallRiskScore: score, classification, riskLevel: score >= 70 ? 'High Risk' : score >= 35 ? 'Medium Risk' : 'Low Risk',
    policyVersion: SCORING_VERSION, scoreKind: 'policy_risk_index', isProbability: false,
    components: { modelScore, urlPoints, indicatorPoints: 0, entityPoints: 0 },
    coverage: { model: 'complete', indicators: indicators.status, urls: urls.status, entities: entities.status },
    note: 'Model score plus the highest link policy score, capped at 100. Indicator and entity observations add no separate points to avoid unvalidated weights and double counting. This is not a phishing probability.' };
}
