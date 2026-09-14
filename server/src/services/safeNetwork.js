import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export class LinkError extends Error {
  constructor(message, code = 'INVALID_URL') { super(message); this.code = code; }
}
export function normalizeUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value.trim()))
    throw new LinkError('Enter a valid public HTTP or HTTPS URL (up to 2,048 characters).');
  let input = value.trim().replace(/^hxxps:/i, 'https:').replace(/^hxxp:/i, 'http:').replace(/\[\.\]/g, '.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(input)) input = 'https://' + input;
  let url; try { url = new URL(input); } catch { throw new LinkError('Enter a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname.includes('.') || url.hostname.endsWith('.'))
    throw new LinkError('Use a public HTTP/HTTPS domain with no embedded credentials or custom port.');
  url.hash = '';
  return url;
}
export function isPublicAddress(address) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === 'unicast';
  } catch { return false; }
}
export async function resolvePublic(hostname, signal, lookup = dns.lookup) {
  signal?.throwIfAborted();
  const blocked = /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(hostname);
  if (blocked || !hostname.includes('.')) throw new LinkError('Local and reserved destinations are blocked.', 'BLOCKED_DESTINATION');
  // DNS answers are validated together, then one address is pinned for the connection.
  let stop;
  const abort = new Promise((_, reject) => { stop = () => reject(new LinkError('Lookup timed out.', 'TIMEOUT')); signal?.addEventListener('abort', stop, { once: true }); });
  let records;
  try { records = await Promise.race([lookup(hostname, { all: true, verbatim: true }), abort]); }
  finally { signal?.removeEventListener('abort', stop); }
  if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new LinkError('Local, private, or reserved network destinations are blocked.', 'BLOCKED_DESTINATION');
  return records.find(record => record.family === 4) || records[0];
}
export function certificateSummary(cert, now = Date.now()) {
  const expires = Date.parse(cert.valid_to), starts = Date.parse(cert.valid_from);
  return {
    status: 'valid', hostname_validated: true,
    issuer: cert.issuer?.O || cert.issuer?.CN || null,
    subject: cert.subject?.CN || null,
    valid_from: Number.isFinite(starts) ? new Date(starts).toISOString() : null,
    valid_until: Number.isFinite(expires) ? new Date(expires).toISOString() : null,
    days_remaining: Number.isFinite(expires) ? Math.floor((expires - now) / 86400000) : null,
    fingerprint_sha256: cert.fingerprint256 || null,
  };
}
export async function safeRequest(input, { method = 'HEAD', signal, maxBytes = 1024 * 1024, lookup } = {}) {
  const url = normalizeUrl(String(input));
  const address = await resolvePublic(url.hostname, signal, lookup);
  return new Promise((resolve, reject) => {
    let tlsInfo = { status: 'not_used' };
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method, agent: false, signal, rejectUnauthorized: true, servername: url.hostname,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family),
      headers: { 'User-Agent': 'DePhish-LinkInspector/1.0', Accept: method === 'GET' ? 'application/rdap+json, application/json' : '*/*', 'Accept-Encoding': 'identity' },
    }, response => {
      let size = 0; const chunks = [];
      if (method === 'HEAD') { response.resume(); resolve({ status: response.statusCode, location: response.headers.location, tls: tlsInfo, body: '', address: address.address }); return; }
      response.on('data', chunk => { size += chunk.length; if (size > maxBytes) request.destroy(new LinkError('Response exceeds the inspection limit.', 'RESPONSE_TOO_LARGE')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location, tls: tlsInfo, body: Buffer.concat(chunks).toString('utf8'), address: address.address }));
    });
    request.on('socket', socket => {
      if (url.protocol === 'https:') socket.once('secureConnect', () => { tlsInfo = certificateSummary(socket.getPeerCertificate()); });
    });
    request.setTimeout(4000, () => request.destroy(new LinkError('Connection timed out.', 'TIMEOUT')));
    request.on('error', reject);
    request.end();
  });
}
export async function publicJson(url, signal, request = safeRequest) {
  let current = normalizeUrl(url);
  for (let hop = 0; hop <= 3; hop++) {
    if (current.protocol !== 'https:') throw new LinkError('Registration data requires HTTPS.');
    const response = await request(current.href, { method: 'GET', signal });
    if ([301,302,303,307,308].includes(response.status) && response.location) { current = normalizeUrl(new URL(response.location, current).href); continue; }
    if (response.status !== 200) throw new LinkError('Registration source returned no usable record.', 'RDAP_UNAVAILABLE');
    return { data: JSON.parse(response.body), source: current.href };
  }
  throw new LinkError('Too many registration redirects.', 'REDIRECT_LIMIT');
}
