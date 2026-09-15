import { getDomain } from 'tldts';
import { normalizeUrl, safeRequest, publicJson } from './safeNetwork.js';

let bootstrapCache;
export function inspectionError(error) {
  const raw = String(error?.code || error?.cause?.code || 'CONNECTION_FAILED');
  const code = ['AbortError', 'TimeoutError'].includes(error?.name) ? 'TIMEOUT' : raw;
  const invalidTls = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(code);
  const reasons = {
    INVALID_DOMAIN: 'The .invalid suffix is reserved and cannot identify a public website.',
    BLOCKED_DESTINATION: 'Private or reserved destination blocked.',
    INVALID_URL: 'The link or redirect address is invalid or unsupported.',
    ENOTFOUND: 'No DNS address was found for this website.',
    EAI_AGAIN: 'DNS lookup temporarily failed. Try again later.',
    ECONNREFUSED: 'The website refused the connection.',
    ECONNRESET: 'The website closed the connection before inspection finished.',
    TIMEOUT: 'The link check timed out.',
    ETIMEDOUT: 'The link check timed out.',
    ABORT_ERR: 'The link check timed out or was interrupted.',
    EHOSTUNREACH: 'The website could not be reached from this network.',
    ENETUNREACH: 'The network could not reach the website.',
    EACCES: 'This environment does not allow the outbound connection.',
    EPERM: 'This environment does not allow the outbound connection.',
  };
  return { failure_code: code, reason: invalidTls ? 'TLS certificate verification failed.' : reasons[code] || (/^(ERR_SSL|ERR_TLS|EPROTO)/.test(code) ? 'The secure connection could not be established.' : 'The link check failed before it could finish.'), tls: { status: invalidTls ? 'invalid' : 'unavailable' } };
}
const plain = value => typeof value === 'string' ? value.slice(0, 300) : null;
export function parseRegistration(data, source, now = Date.now()) {
  const date = action => {
    const value = data.events?.find(event => event.eventAction === action)?.eventDate;
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
  };
  const entityName = role => {
    const entity = data.entities?.find(entity => entity.roles?.includes(role));
    const card = entity?.vcardArray?.[1];
    const value = card?.find(row => row[0] === 'fn')?.[3];
    return plain(value);
  };
  const registered = date('registration');
  const age = registered ? Math.floor((now - Date.parse(registered)) / 86400000) : null;
  return { status: 'available', source, registrar: entityName('registrar'),
    registrant: entityName('registrant'), registered_at: registered,
    age_days: age !== null && age >= 0 ? age : null, expires_at: date('expiration'),
    updated_at: date('last changed'), nameservers: (data.nameservers || []).slice(0, 12).map(row => plain(row.ldhName)).filter(Boolean),
    ownership_note: 'The public registrant, if disclosed, may be a privacy service. It does not identify who created this page.' };
}
export async function lookupRegistration(domain, signal, jsonRequest = publicJson) {
  if (/(^|\.)invalid$/i.test(domain || '')) return { status: 'unavailable', reason: 'The .invalid suffix has no public domain registration.' };
  if (!domain) return { status: 'unavailable', reason: 'No registrable domain was identified.' };
  try {
    let bootstrap = bootstrapCache?.expires > Date.now() ? bootstrapCache.data : null;
    if (!bootstrap) {
      bootstrap = (await jsonRequest('https://data.iana.org/rdap/dns.json', signal)).data;
      if (jsonRequest === publicJson) bootstrapCache = { data: bootstrap, expires: Date.now() + 24 * 3600000 };
    }
    const tld = domain.split('.').at(-1);
    const endpoint = bootstrap.services?.find(([tlds]) => tlds.includes(tld))?.[1]?.find(url => url.startsWith('https://'));
    if (!endpoint) return { status: 'unavailable', reason: 'No HTTPS RDAP provider is listed for this domain suffix.' };
    const { data, source } = await jsonRequest(new URL('domain/' + domain, endpoint.endsWith('/') ? endpoint : endpoint + '/').href, signal);
    return parseRegistration(data, source);
  } catch (error) { const failure = inspectionError(error); return { status: 'unavailable', failure_code: failure.failure_code, reason: `Public registration data could not be retrieved. ${failure.reason} This is not evidence of phishing.` }; }
}
export async function inspectDestination(url, signal, request = safeRequest) {
  const chain = [];
  const seen = new Set();
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    if (seen.has(current.href)) return { status: 'incomplete', failure_code: 'REDIRECT_LOOP', reason: 'The website redirects in a loop; inspection stopped.', redirects: chain };
    seen.add(current.href);
    try {
      const response = await request(current.href, { signal });
      if (!Number.isInteger(response?.status) || response.status < 100 || response.status > 599) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      chain.push({ url: current.href, http_status: response.status, tls: response.tls, address: response.address });
      if ([301,302,303,307,308].includes(response.status)) {
        if (!response.location) return { status: 'incomplete', failure_code: 'MISSING_REDIRECT_LOCATION', reason: 'The website returned a redirect without a destination address.', redirects: chain };
        let next;
        try { next = normalizeUrl(new URL(response.location, current).href); }
        catch { return { status: 'incomplete', failure_code: 'INVALID_REDIRECT', reason: 'The website redirects to an invalid or unsupported address; inspection stopped.', redirects: chain }; }
        if (current.protocol === 'https:' && next.protocol === 'http:') return { status: 'incomplete', failure_code: 'HTTPS_DOWNGRADE', reason: 'Redirect downgrades HTTPS to HTTP; stopped.', redirects: chain };
        current = next; continue;
      }
      if ([405, 501].includes(response.status)) return { status: 'incomplete', final_url: current.href,
        failure_code: 'HEAD_UNSUPPORTED', reason: 'The destination does not support HEAD inspection.', redirects: chain };
      if ([401, 403, 429].includes(response.status)) return { status: 'incomplete', final_url: current.href,
        failure_code: response.status === 429 ? 'REMOTE_RATE_LIMIT' : 'ACCESS_RESTRICTED', reason: response.status === 429 ? 'The website limited inspection requests. Try again later.' : 'The website requires login or blocks inspection requests.', redirects: chain };
      return { status: 'checked', final_url: current.href, redirects: chain,
        note: 'HEAD request only. No page scripts, downloads, or malware/reputation scan were performed.' };
    } catch (error) {
      const failure = inspectionError(error);
      return { status: failure.failure_code === 'BLOCKED_DESTINATION' ? 'blocked' : 'incomplete', failed_url: current.href, ...failure, redirects: chain };
    }
  }
  return { status: 'incomplete', failure_code: 'REDIRECT_LIMIT', reason: 'The website exceeded the redirect limit; inspection stopped.', redirects: chain };
}
export async function inspectLink(value, { request = safeRequest, registration = lookupRegistration } = {}) {
  const url = normalizeUrl(value);
  const signal = AbortSignal.timeout(15000);
  const domain = getDomain(url.hostname, { allowPrivateDomains: false });
  const [destination, record] = await Promise.all([inspectDestination(url, signal, request), Promise.resolve().then(() => registration(domain, signal)).catch(error => {
    const failure = inspectionError(error);
    return { status: 'unavailable', failure_code: failure.failure_code, reason: 'Registration lookup failed. Destination checks are still shown.' };
  })]);
  return { url: url.href, hostname: url.hostname, domain, checked_at: new Date().toISOString(),
    registration: record, destination,
    limitations: 'Domain age and a valid TLS certificate do not establish safety. The website creator cannot be reliably identified from these checks.' };
}
