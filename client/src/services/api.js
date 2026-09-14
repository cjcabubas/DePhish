import { api as mockApi } from './mockApi.js';
import { authApi } from './authApi.js';

const baseUrl = (import.meta.env?.VITE_SCAN_API_URL || '').replace(/\/$/, '');
const scans = [];

export async function analyzeMessage(text, type = 'email') {
  if (!text.trim()) throw new Error('Paste a message before scanning.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);
  try {
    const response = await fetch(`${baseUrl}/api/scans/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, type }),
      signal: controller.signal,
    });
    if (!response.ok) {
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
      type: result.message_type === 'sms' ? 'SMS' : 'Email',
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

// Community reports remain demo data until their backend is implemented.
export const api = {
  reports: mockApi.reports,
  auth: authApi,
  scans: { clear: () => { scans.length = 0; }, analyze: analyzeMessage, list: async () => [...scans], get: async id => scans.find(scan => scan.id === id) },
};
