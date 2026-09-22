import { createHash } from 'node:crypto';
import { SCAN_TERMS } from '../../../client/src/data/scanTerms.js';
import { orchestrateScan } from '../services/scanOrchestrator.js';
import { analyzerClient } from '../services/analyzerClient.js';
import { persistScan } from '../services/scanPersistenceService.js';
export function scanController(mlUrl, scans, identifiers, consents, pseudonymizationKey) {
  return async (req, res) => {
    const { text, type = 'auto' } = req.body || {};
    if (typeof text !== 'string' || !text.trim() || text.length > 5000 || !['auto', 'email', 'sms', 'url', 'unknown'].includes(type))
      return res.status(400).json({ message: 'Enter a message up to 5,000 characters and a valid message type.' });
    if (req.body.tosAccepted !== true) return res.status(400).json({ message: 'Please read and accept the scan consent terms before scanning.' });
    if (req.body.termsVersion !== SCAN_TERMS.version) return res.status(409).json({ message: 'The scan consent terms have changed. Refresh the page and review the current terms.' });
    let consent;
    try {
      if (!consents) throw new Error('Consent storage unavailable');
      consent = await consents.create({ userId: req.user ? String(req.user._id) : null,
        source: req.user ? 'account' : 'guest', accepted: true, acceptedAt: new Date(),
        termsVersion: SCAN_TERMS.version, termsEffectiveDate: SCAN_TERMS.effectiveDate,
        termsText: SCAN_TERMS.text, termsSha256: createHash('sha256').update(SCAN_TERMS.text).digest('hex') });
    } catch {
      return res.status(503).json({ message: 'Your consent could not be saved. No scan was performed. Please try again.' });
    }
    const consentReceipt = { id: String(consent._id), termsVersion: consent.termsVersion, acceptedAt: consent.acceptedAt };
    try {
      const { report, artifacts, prepared } = await orchestrateScan({ text, type }, analyzerClient(mlUrl));
      const storage = await persistScan({ report, artifacts, prepared, user: req.user, consent,
        scans, identifiers, pseudonymizationKey });
      res.json({ ...report, ...storage, consent: consentReceipt });
    } catch (error) {
      if (error.status === 429) {
        res.set('Retry-After', '60');
        return res.status(429).json({ message: 'Scanning service request limit reached. Please try again in a minute.' });
      }
      res.status(503).json({ message: 'Scanning service unavailable. Please try again.' });
    }
  };
}
