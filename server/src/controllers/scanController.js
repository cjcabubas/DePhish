import { assessScan } from '../services/scanService.js';
export function scanController(mlUrl) {
  return async (req, res) => {
    const { text, type = 'auto' } = req.body || {};
    if (typeof text !== 'string' || !text.trim() || text.length > 5000 || !['auto', 'email', 'sms'].includes(type))
      return res.status(400).json({ message: 'Enter a message up to 5,000 characters and a valid message type.' });
    try {
      const result = await assessScan({ text, type }, { classify: async input => {
        const response = await fetch(new URL('/api/analyze', mlUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('ML unavailable');
        return response.json();
      } });
      res.json(result);
    } catch { res.status(503).json({ message: 'Scanning service unavailable. Please try again.' }); }
  };
}
