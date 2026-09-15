import { assessScan } from '../services/scanService.js';
import { recordPhishingIdentifiers } from '../services/identifierService.js';
export function scanController(mlUrl, scans, identifiers) {
  return async (req, res) => {
    const { text, type = 'auto' } = req.body || {};
    if (typeof text !== 'string' || !text.trim() || text.length > 5000 || !['auto', 'email', 'sms'].includes(type))
      return res.status(400).json({ message: 'Enter a message up to 5,000 characters and a valid message type.' });
    try {
      const result = await assessScan({ text, type }, { classify: async input => {
        const response = await fetch(new URL('/api/analyze', mlUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(30000) });
        if (response.status === 429) throw Object.assign(new Error('ML rate limit'), { status: 429 });
        if (!response.ok) throw new Error('ML unavailable');
        return response.json();
      } });
      let persistence = { status: 'unavailable', reason: 'Scan completed, but the report could not be saved.' };
      if (scans) {
        try {
          const saved = await scans.create({ userId: req.user ? String(req.user._id) : null,
            source: req.user ? 'account' : 'guest', message: text, tosAcknowledged: req.body.tosAccepted === true,
            title: text.trim().split('\n')[0].slice(0, 80), result });
          persistence = { status: 'saved', id: String(saved._id), scope: req.user ? 'account' : 'guest' };
        } catch { persistence = { status: 'unavailable', reason: 'Scan completed, but history could not be saved.' }; }
      }
      const identifier_registry = await recordPhishingIdentifiers(text, result, identifiers,
        { userId: req.user ? String(req.user._id) : undefined, scanId: persistence.id });
      res.json({ ...result, persistence, identifier_registry });
    } catch (error) {
      if (error.status === 429) {
        res.set('Retry-After', '60');
        return res.status(429).json({ message: 'Scanning service request limit reached. Please try again in a minute.' });
      }
      res.status(503).json({ message: 'Scanning service unavailable. Please try again.' });
    }
  };
}
