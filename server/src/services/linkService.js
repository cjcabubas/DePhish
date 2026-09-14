import { getDomain } from 'tldts';
import { normalizeUrl, safeRequest, publicJson } from './safeNetwork.js';

let bootstrapCache;
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
  } catch { return { status: 'unavailable', reason: 'Public registration data could not be retrieved. This is not evidence of phishing.' }; }
}
export async function inspectDestination(url, signal, request = safeRequest) {
  const chain = [];
  const seen = new Set();
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    if (seen.has(current.href)) return { status: 'incomplete', reason: 'Redirect loop.', redirects: chain };
    seen.add(current.href);
    try {
      const response = await request(current.href, { signal });
      chain.push({ url: current.href, http_status: response.status, tls: response.tls, address: response.address });
      if ([301,302,303,307,308].includes(response.status) && response.location) {
        const next = normalizeUrl(new URL(response.location, current).href);
        if (current.protocol === 'https:' && next.protocol === 'http:') return { status: 'incomplete', reason: 'Redirect downgrades HTTPS to HTTP; stopped.', redirects: chain };
        current = next; continue;
      }
      if ([405, 501].includes(response.status)) return { status: 'incomplete', final_url: current.href,
        reason: 'The destination does not support HEAD inspection.', redirects: chain };
      return { status: 'checked', final_url: current.href, redirects: chain,
        note: 'HEAD request only. No page scripts, downloads, or malware/reputation scan were performed.' };
    } catch (error) {
      const code = String(error.code || 'CONNECTION_FAILED');
      const invalidTls = /CERT|TLS_CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(code);
      return { status: code === 'BLOCKED_DESTINATION' ? 'blocked' : 'incomplete', failed_url: current.href,
        failure_code: code,
        reason: invalidTls ? 'TLS certificate verification failed.' : code === 'BLOCKED_DESTINATION' ? 'Private or reserved destination blocked.' : 'Connection failed or timed out.',
        tls: { status: invalidTls ? 'invalid' : 'unavailable' }, redirects: chain };
    }
  }
  return { status: 'incomplete', reason: 'Redirect limit reached.', redirects: chain };
}
export async function inspectLink(value, { request = safeRequest, registration = lookupRegistration } = {}) {
  const url = normalizeUrl(value);
  const signal = AbortSignal.timeout(15000);
  const domain = getDomain(url.hostname, { allowPrivateDomains: false });
  const [destination, record] = await Promise.all([inspectDestination(url, signal, request), registration(domain, signal)]);
  return { url: url.href, hostname: url.hostname, domain, checked_at: new Date().toISOString(),
    registration: record, destination,
    limitations: 'Domain age and a valid TLS certificate do not establish safety. The website creator cannot be reliably identified from these checks.' };
}
