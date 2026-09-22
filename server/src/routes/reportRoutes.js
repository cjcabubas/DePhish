import { Router } from 'express';
import { createHash } from 'node:crypto';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rateLimits.js';
import { SCAN_TERMS } from '../../../client/src/data/scanTerms.js';
import { orchestrateScan } from '../services/scanOrchestrator.js';
import { analyzerClient } from '../services/analyzerClient.js';
import { validateReportInput, analysisText, prepareStoredReport, reviewDecision, reportError } from '../services/reportService.js';

export function reportRoutes({ users, scans, reports, consents, origins = [], mlUrl, analyze = input => orchestrateScan(input, analyzerClient(mlUrl)) }) {
  const router = Router();
  let active = 0;
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && (!req.is('application/json') || req.get('X-DePhish-Client') !== 'web' ||
      (req.get('Origin') && !origins.includes(req.get('Origin'))))) return res.status(403).json({ message: 'Request origin or format is not allowed.' });
    next();
  });
  router.use(apiRateLimit({ limit: 30, message: 'Too many report requests. Please try again in a minute.' }));
  router.use((req, res, next) => reports ? next() : res.status(503).json({ message: 'Reports are temporarily unavailable.' }));
  const page = req => {
    const value = Number(req.query.page || 1);
    if (!Number.isInteger(value) || value < 1 || value > 10000) throw reportError(400, 'Invalid page.');
    return value;
  };
  const list = admin => async (req, res, next) => {
    try {
      const status = req.query.status;
      if (status && !['pending', 'verified', 'rejected'].includes(status)) throw reportError(400, 'Invalid report status.');
      res.json(await reports.list({ userId: admin ? undefined : String(req.user._id), status, page: page(req) }));
    } catch (error) { next(error); }
  };
  router.get('/', requireAuth(users), list(false));
  router.get('/admin', requireAuth(users), requireRole('admin'), list(true));
  router.get('/threat-indicators', requireAuth(users), requireRole('admin'), async (req, res, next) => {
    try { res.json(await reports.threats(page(req))); } catch (error) { next(error); }
  });
  router.post('/', apiRateLimit({ limit: 5, message: 'Too many report submissions. Please try again in a minute.' }),
    (req, res, next) => req.session?.userId ? requireAuth(users)(req, res, next) : next(), async (req, res, next) => {
      if (active >= 4) return res.status(503).json({ message: 'Report analysis is busy. Please try again.' });
      active++;
      try {
        const fields = validateReportInput(req.body);
        const sourceScanId = req.body.sourceScanId || null;
        if (sourceScanId) {
          if (!req.user) throw reportError(401, 'Log in to report a saved scan.');
          if (!scans) throw reportError(503, 'Saved scans are unavailable.');
          const scan = await scans.findOwned(sourceScanId, String(req.user._id));
          if (!scan) throw reportError(404, 'Saved scan not found.');
          fields.message = scan.message;
        }
        const text = analysisText(fields);
        if (req.body.tosAccepted !== true) throw reportError(400, 'Accept the scan consent terms before submitting.');
        if (req.body.termsVersion !== SCAN_TERMS.version) throw reportError(409, 'The consent terms have changed. Refresh and review them.');
        if (!consents) throw reportError(503, 'Consent storage is unavailable. No report was analyzed.');
        const consent = await consents.create({ userId: req.user ? String(req.user._id) : null,
          source: req.user ? 'account' : 'guest', accepted: true, acceptedAt: new Date(), termsVersion: SCAN_TERMS.version,
          termsEffectiveDate: SCAN_TERMS.effectiveDate, termsText: SCAN_TERMS.text,
          termsSha256: createHash('sha256').update(SCAN_TERMS.text).digest('hex') });
        const { report, prepared, artifacts } = await analyze({ text, type: 'auto' });
        const stored = prepareStoredReport(fields, prepared, artifacts, report);
        const saved = await reports.create({ ...stored, userId: req.user ? String(req.user._id) : null,
          sourceScanId, consentId: consent._id, status: 'pending', revision: 0, approvedIndicatorIds: [],
          expiresAt: new Date(Date.now() + 30 * 86400000) });
        res.status(201).json({ report: saved });
      } catch (error) { next(error); } finally { active--; }
    });
  router.patch('/:id/status', requireAuth(users), requireRole('admin'), async (req, res, next) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw reportError(400, 'Invalid report reference.');
      const report = await reports.find(req.params.id);
      if (!report) throw reportError(404, 'Report not found or expired.');
      const decision = reviewDecision(report, req.body);
      const updated = await reports.review(req.params.id, req.body.revision, decision, String(req.user._id));
      if (!updated) throw reportError(409, 'Another admin changed this report. Refresh before reviewing it again.');
      res.json({ report: updated });
    } catch (error) { next(error); }
  });
  router.use((error, req, res, next) => {
    if ([400, 401, 404, 409, 429].includes(error.status)) return res.status(error.status).json({ message: error.message });
    res.status(503).json({ message: 'Report processing is unavailable. The requested operation did not complete. Please refresh and try again.' });
  });
  return router;
}
