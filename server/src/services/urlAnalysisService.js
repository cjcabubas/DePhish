import { inspectLink, inspectionError } from './linkService.js';
import { linkRisk } from './riskService.js';

export async function analyzeUrls(artifacts, inspect = inspectLink) {
  const checks = await Promise.all(artifacts.urls.slice(0, 3).map(async item => {
    try { const evidence = await inspect(item.url); return { ...evidence, url: item.url, risk: linkRisk(evidence) }; }
    catch (error) { return { url: item.url, registration: { status: 'unavailable' },
      destination: { status: 'incomplete', ...inspectionError(error), redirects: [] }, risk: { score: 0, factors: [] } }; }
  }));
  const skipped = Math.max(0, artifacts.urls.length - checks.length);
  const incomplete = checks.some(check => check.registration?.age_days == null || check.destination?.status !== 'checked');
  return { status: incomplete || skipped ? 'partial' : 'complete', riskScore: Math.max(0, ...checks.map(check => check.risk.score)),
    checks, checked: checks.length, skipped, incomplete,
    note: 'Up to three unique URLs. HEAD, DNS, TLS and RDAP checks only; no page execution or reputation feed. Missing evidence is not evidence of safety.' };
}
