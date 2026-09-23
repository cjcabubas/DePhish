import { authApi } from './authApi.js';

const baseUrl = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');
const scans = [];
export const messageTypeLabel = type => ({ email: 'Email', sms: 'SMS', url: 'URL', unknown: 'Message' }[type] || 'Message');

export async function analyzeMessage(text, type = 'auto', { tosAccepted, termsVersion } = {}) {
  if (!text.trim()) throw new Error('Paste a message before scanning.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);
  try {
    const response = await fetch(`${baseUrl}/api/scans/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web' },
      credentials: 'include',
      body: JSON.stringify({ text, type, ...(typeof tosAccepted === 'boolean' ? { tosAccepted, termsVersion } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if ([400, 409, 503].includes(response.status)) {
        const error = await response.json?.().catch(() => null);
        if (error?.message) throw new Error(error.message);
      }
      if (response.status === 429) throw new Error('Too many scans. Please wait a minute before trying again.');
      if ([502, 504].includes(response.status)) throw new Error('Cannot reach the scanning service. Please check that it is running and try again.');
      throw new Error(response.status === 503
        ? 'The scanning service is unavailable. Please try again later.'
        : `Scanning failed (${response.status}). Please try again.`);
    }
    const result = await response.json();
    if (!Number.isFinite(result.risk_score) || !['Legitimate', 'Suspicious', 'Phishing'].includes(result.prediction)
      || !Array.isArray(result.detected_indicators) || !Array.isArray(result.detected_urls)) {
      throw new Error('The scanning service returned an invalid result. Please try again.');
    }
    scans.unshift({
      id: crypto.randomUUID(), title: text.trim().split('\n')[0].slice(0, 80),
      type: messageTypeLabel(result.message_type),
      date: new Date().toLocaleDateString(), score: result.risk_score,
      status: result.prediction === 'Legitimate' ? 'Low risk' : 'Suspicious',
      summary: `${result.prediction} · ${result.risk_level}. ${result.detected_indicators.map(i => i.title).join('; ')}`,
      result,
    });
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Scanning timed out. Please try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the scanning service. Please check that it is running and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function listScans({ authenticated = false } = {}) {
  const response = await fetch(`${baseUrl}/api/scans`, { credentials: 'include' });
  if (response.status === 401) {
    if (authenticated) throw new Error('Your session has expired. Please log in again.');
    return [...scans];
  }
  if (response.status === 429) throw new Error('Too many history requests. Please wait a minute before trying again.');
  if (!response.ok) throw new Error('Scan history is unavailable. Please try again.');
  const data = await response.json();
  return data.scans.map(row => ({
    id: row.id, title: row.title, date: new Date(row.created_at).toLocaleDateString(),
    type: messageTypeLabel(row.result.message_type), score: row.result.risk_score,
    status: row.result.prediction === 'Legitimate' ? 'Low risk' : 'Suspicious',
    summary: `${row.result.prediction} · ${row.result.risk_level}`, result: row.result,
  }));
}

async function dashboardStats(admin = false) {
  const response = await fetch(`${baseUrl}/api/scans/${admin ? 'admin/' : ''}stats`, { credentials: 'include' });
  if (response.status === 401) throw new Error('Your session has expired. Please log in again.');
  if (response.status === 403) throw new Error('You do not have access to this dashboard.');
  if (response.status === 429) throw new Error('Too many dashboard requests. Please wait a minute before trying again.');
  if (!response.ok) throw new Error('Dashboard data is unavailable. Please try again.');
  return response.json();
}

async function reportRequest(path = '', { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${baseUrl}/api/reports${path}`, {
      method, credentials: 'include', signal: controller.signal,
      ...(body ? { headers: { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || 'Reports are unavailable. Please try again.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Refresh your reports before retrying.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export const api = {
  reports: {
    submit: body => reportRequest('', { method: 'POST', body }),
    list: ({ admin = false, status = '', page = 1 } = {}) => reportRequest(`${admin ? '/admin' : ''}?status=${encodeURIComponent(status)}&page=${page}`),
    review: (id, body) => reportRequest(`/${encodeURIComponent(id)}/status`, { method: 'PATCH', body }),
    threats: (page = 1) => reportRequest(`/threat-indicators?page=${page}`),
  },
  auth: authApi,
  dashboard: { stats: dashboardStats },
  scans: { clear: () => { scans.length = 0; }, analyze: analyzeMessage, list: listScans, get: async id => (await listScans()).find(scan => scan.id === id) },
  learn: {
    getProgress: async () => {
      const res = await fetch(`${baseUrl}/api/learn/progress`, { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Could not load learning progress.');
      return (await res.json()).modules ?? [];
    },
    saveProgress: async (modules) => {
      const res = await fetch(`${baseUrl}/api/learn/progress`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules }),
      });
      if (res.status === 401) return null; // not logged in — silently skip
      if (!res.ok) throw new Error('Could not save learning progress.');
      return (await res.json()).modules ?? [];
    },
  },
};
